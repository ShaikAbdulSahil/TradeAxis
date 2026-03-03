import {
    Injectable,
    Inject,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { REDIS_CACHE } from '@app/common';
import { DatabaseService } from '@app/common';
import {
    OrderSide,
    OrderType,
    OrderStatus,
    PendingOrder,
    TickData,
} from '@app/common';
import { OrdersRepository } from './orders.repository';
import Redis from 'ioredis';

@Injectable()
export class OrdersService {
    private readonly logger = new Logger(OrdersService.name);

    constructor(
        private readonly repo: OrdersRepository,
        private readonly db: DatabaseService,
        @Inject(REDIS_CACHE) private readonly redis: Redis,
        @InjectQueue('order-execution') private readonly executionQueue: Queue,
    ) { }

    /**
     * Place a new order.
     * - MARKET: Executes immediately via BullMQ
     * - LIMIT/STOP/STOP_LIMIT: Stored as PENDING in DB + Redis HSET
     */
    async placeOrder(
        userId: string,
        data: {
            instrument_token: number;
            side: OrderSide;
            order_type: OrderType;
            quantity: number;
            price?: number;
            trigger_price?: number;
            stop_limit_price?: number;
        },
    ) {
        // ── Step 1: Validate user has enough balance/equity ──
        const wallet = await this.repo.getWallet(userId);
        if (!wallet) {
            throw new BadRequestException('Wallet not found');
        }
        if (wallet.is_frozen) {
            throw new BadRequestException('Wallet is frozen, cannot place orders');
        }

        // Calculate required margin for this order
        const requiredMargin = await this.calculateRequiredMargin(
            data.instrument_token,
            data.quantity,
            data.price || data.trigger_price || undefined,
            userId,
        );

        const freeMargin = Number(wallet.free_margin);
        if (requiredMargin > freeMargin) {
            throw new BadRequestException(
                `Insufficient margin. Required: ₹${requiredMargin.toFixed(2)}, Available: ₹${freeMargin.toFixed(2)}`,
            );
        }

        // ── Step 2: Handle by order type ──
        if (data.order_type === OrderType.MARKET) {
            return this.handleMarketOrder(userId, data, wallet);
        } else {
            return this.handlePendingOrder(userId, data, wallet, requiredMargin);
        }
    }

    /**
     * MARKET ORDER: Immediate execution
     * Fetch LTP from Redis, push to BullMQ for atomic execution
     */
    private async handleMarketOrder(
        userId: string,
        data: any,
        wallet: any,
    ) {
        // Get current LTP from Redis
        const tickRaw = await this.redis.get(`tick:${data.instrument_token}`);
        if (!tickRaw) {
            throw new BadRequestException(
                'No live price available for this instrument. Ensure market data is streaming.',
            );
        }

        const tick: TickData = JSON.parse(tickRaw);
        const executionPrice = tick.ltp;

        // Create order in DB with PENDING status
        const order = await this.repo.create({
            user_id: userId,
            instrument_token: data.instrument_token,
            side: data.side,
            order_type: data.order_type,
            quantity: data.quantity,
            status: 'PENDING',
        });

        // Push to BullMQ for atomic execution
        await this.executionQueue.add('execute-market', {
            orderId: order.id,
            userId,
            instrumentToken: data.instrument_token,
            side: data.side,
            quantity: data.quantity,
            executionPrice,
        });

        this.logger.log(
            `Market order queued: ${data.side} ${data.quantity}x token:${data.instrument_token} @ ₹${executionPrice}`,
        );

        return { order, message: 'Market order placed, executing...' };
    }

    /**
     * LIMIT/STOP/STOP_LIMIT ORDER: Store as pending
     * Save to DB + Redis HSET for tick matching
     */
    private async handlePendingOrder(
        userId: string,
        data: any,
        wallet: any,
        requiredMargin: number,
    ) {
        // Validate required fields per order type
        if (data.order_type === OrderType.LIMIT && !data.price) {
            throw new BadRequestException('Limit orders require a price');
        }
        if (data.order_type === OrderType.STOP && !data.trigger_price) {
            throw new BadRequestException('Stop orders require a trigger_price');
        }
        if (data.order_type === OrderType.STOP_LIMIT) {
            if (!data.trigger_price || !data.stop_limit_price) {
                throw new BadRequestException(
                    'Stop-Limit orders require both trigger_price and stop_limit_price',
                );
            }
        }

        // Create the order in DB
        const order = await this.repo.create({
            user_id: userId,
            instrument_token: data.instrument_token,
            side: data.side,
            order_type: data.order_type,
            quantity: data.quantity,
            price: data.price,
            trigger_price: data.trigger_price,
            stop_limit_price: data.stop_limit_price,
            status: 'PENDING',
        });

        // Block margin for pending order
        await this.repo.updateWallet(userId, {
            blocked_margin: Number(wallet.blocked_margin) + requiredMargin,
            free_margin: Number(wallet.free_margin) - requiredMargin,
        });

        // Store in Redis HSET for fast tick-matching
        const pendingOrder: PendingOrder = {
            id: order.id,
            user_id: userId,
            instrument_token: data.instrument_token,
            side: data.side,
            order_type: data.order_type,
            quantity: data.quantity,
            price: data.price || null,
            trigger_price: data.trigger_price || null,
            stop_limit_price: data.stop_limit_price || null,
        };

        await this.redis.hset(
            `pending_orders:${data.instrument_token}`,
            order.id,
            JSON.stringify(pendingOrder),
        );

        this.logger.log(
            `Pending ${data.order_type} order created: ${data.side} ${data.quantity}x token:${data.instrument_token}`,
        );

        return { order, message: `${data.order_type} order placed` };
    }

    /**
     * Cancel a pending order
     */
    async cancelOrder(userId: string, orderId: string) {
        const order = await this.repo.findById(orderId);
        if (!order) throw new BadRequestException('Order not found');
        if (order.user_id !== userId) throw new BadRequestException('Unauthorized');
        if (order.status !== 'PENDING') {
            throw new BadRequestException('Only pending orders can be cancelled');
        }

        // Release blocked margin
        const wallet = await this.repo.getWallet(userId);
        const requiredMargin = await this.calculateRequiredMargin(
            order.instrument_token,
            order.quantity,
            Number(order.price) || Number(order.trigger_price) || undefined,
            userId,
        );

        await this.repo.updateWallet(userId, {
            blocked_margin: Math.max(0, Number(wallet.blocked_margin) - requiredMargin),
            free_margin: Number(wallet.free_margin) + requiredMargin,
        });

        // Remove from Redis HSET
        await this.redis.hdel(
            `pending_orders:${order.instrument_token}`,
            orderId,
        );

        // Update DB status
        await this.repo.updateStatus(orderId, 'CANCELLED');

        this.logger.log(`Order cancelled: ${orderId}`);
        return { message: 'Order cancelled successfully' };
    }

    /**
     * Get user's order history
     */
    async getOrders(userId: string, limit = 50) {
        return this.repo.findByUserId(userId, limit);
    }

    /**
     * Calculate required margin for an order.
     * margin = (price * quantity) / leverage
     */
    private async calculateRequiredMargin(
        instrumentToken: number,
        quantity: number,
        price?: number,
        userId?: string,
    ): Promise<number> {
        // Get price: use provided price or fetch LTP from Redis
        let effectivePrice = price;
        if (!effectivePrice) {
            const tickRaw = await this.redis.get(`tick:${instrumentToken}`);
            if (tickRaw) {
                effectivePrice = JSON.parse(tickRaw).ltp;
            }
        }

        if (!effectivePrice) {
            // Fallback: cannot calculate margin without a price
            throw new BadRequestException('Cannot determine price for margin calculation');
        }

        // Get user leverage
        let leverage = 100;
        if (userId) {
            const user = await this.db.queryOne<{ leverage: number }>(
                'SELECT leverage FROM users WHERE id = $1',
                [userId],
            );
            if (user) leverage = user.leverage;
        }

        return (effectivePrice * quantity) / leverage;
    }
}
