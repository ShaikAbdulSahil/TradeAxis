import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { REDIS_PUBLISHER } from '@app/common';
import { DatabaseService, OrderSide } from '@app/common';
import { OrdersRepository } from './orders.repository';
import Redis from 'ioredis';

interface ExecutionJob {
    orderId: string;
    userId: string;
    instrumentToken: number;
    side: OrderSide;
    quantity: number;
    executionPrice: number;
    orderType?: string;
}

/**
 * BullMQ Worker: Order Execution Processor
 *
 * Handles the atomic execution of orders in a database transaction:
 * 1. Re-validates free margin (could have changed since order was placed)
 * 2. Updates the order status to COMPLETE
 * 3. Creates/updates the position (UPSERT)
 * 4. Updates the wallet (balance, margins)
 * 5. Logs the wallet transaction
 * 6. Publishes notification to user's private channel
 */
@Processor('order-execution')
export class OrderExecutionProcessor extends WorkerHost {
    private readonly logger = new Logger(OrderExecutionProcessor.name);

    constructor(
        private readonly repo: OrdersRepository,
        private readonly db: DatabaseService,
        @Inject(REDIS_PUBLISHER) private readonly redisPub: Redis,
    ) {
        super();
    }

    async process(job: Job<ExecutionJob>): Promise<any> {
        const { orderId, userId, instrumentToken, side, quantity, executionPrice } =
            job.data;

        this.logger.log(
            `Processing: ${side} ${quantity}x token:${instrumentToken} @ ₹${executionPrice}`,
        );

        try {
            const result = await this.db.transaction(async (client) => {
                // ── 1. Re-validate wallet balance ──
                const wallet = await this.repo.getWallet(userId, client);
                if (!wallet) throw new Error('Wallet not found');

                // Get user leverage
                const userResult = await client.query(
                    'SELECT leverage FROM users WHERE id = $1',
                    [userId],
                );
                const leverage = userResult.rows[0]?.leverage || 100;

                const requiredMargin = (executionPrice * quantity) / leverage;
                const availableMargin =
                    Number(wallet.free_margin) + Number(wallet.blocked_margin);

                if (requiredMargin > availableMargin) {
                    // Reject: insufficient margin
                    await this.repo.updateStatus(orderId, 'REJECTED', undefined, client);

                    return {
                        success: false,
                        reason: 'Insufficient margin at execution time',
                    };
                }

                // ── 2. Get or create position ──
                const existingPosition = await this.repo.getPosition(
                    userId,
                    instrumentToken,
                    client,
                );

                let newQuantity: number;
                let newAvgPrice: number;
                let realizedPnl = 0;

                if (existingPosition) {
                    const posQty = existingPosition.quantity;
                    const posAvg = Number(existingPosition.average_price);

                    if (
                        (side === OrderSide.BUY && posQty >= 0) ||
                        (side === OrderSide.SELL && posQty < 0)
                    ) {
                        // Adding to position (same direction)
                        const signedQty =
                            side === OrderSide.BUY ? quantity : -quantity;
                        newQuantity = posQty + signedQty;
                        // Weighted average price
                        newAvgPrice =
                            (Math.abs(posQty) * posAvg +
                                Math.abs(signedQty) * executionPrice) /
                            Math.abs(newQuantity);
                    } else {
                        // Reducing or reversing position (opposite direction)
                        const signedQty =
                            side === OrderSide.BUY ? quantity : -quantity;
                        const closingQty = Math.min(
                            Math.abs(signedQty),
                            Math.abs(posQty),
                        );

                        // Realize PnL on the closing portion
                        if (posQty > 0) {
                            // Closing a LONG position
                            realizedPnl = (executionPrice - posAvg) * closingQty;
                        } else {
                            // Closing a SHORT position
                            realizedPnl = (posAvg - executionPrice) * closingQty;
                        }

                        newQuantity = posQty + signedQty;

                        if (newQuantity === 0) {
                            // Position fully closed
                            newAvgPrice = 0;
                        } else if (
                            Math.sign(newQuantity) !== Math.sign(posQty)
                        ) {
                            // Position reversed
                            newAvgPrice = executionPrice;
                        } else {
                            // Partially closed
                            newAvgPrice = posAvg;
                        }
                    }
                } else {
                    // New position
                    newQuantity = side === OrderSide.BUY ? quantity : -quantity;
                    newAvgPrice = executionPrice;
                }

                // ── 3. Upsert position ──
                await this.repo.upsertPosition(
                    userId,
                    instrumentToken,
                    newQuantity,
                    parseFloat(newAvgPrice.toFixed(2)),
                    parseFloat(realizedPnl.toFixed(2)),
                    client,
                );

                // ── 4. Update wallet ──
                const tradeValue = executionPrice * quantity;
                const marginUsed = tradeValue / leverage;
                const newUsedMargin = Number(wallet.used_margin) + marginUsed;
                const newBalance = Number(wallet.balance) + realizedPnl;

                // Release any blocked margin (for pending orders that are now executing)
                const releasedBlocked = Math.min(
                    Number(wallet.blocked_margin),
                    marginUsed,
                );
                const newBlockedMargin =
                    Number(wallet.blocked_margin) - releasedBlocked;

                const newFreeMargin =
                    newBalance - newUsedMargin - newBlockedMargin;

                await this.repo.updateWallet(
                    userId,
                    {
                        balance: parseFloat(newBalance.toFixed(2)),
                        equity: parseFloat(newBalance.toFixed(2)),
                        used_margin: parseFloat(newUsedMargin.toFixed(2)),
                        free_margin: parseFloat(newFreeMargin.toFixed(2)),
                        blocked_margin: parseFloat(newBlockedMargin.toFixed(2)),
                    },
                    client,
                );

                // ── 5. Log wallet transaction ──
                const txType =
                    realizedPnl >= 0 ? 'TRADE_PROFIT' : 'TRADE_LOSS';
                await this.repo.logWalletTransaction(
                    wallet.id,
                    parseFloat(realizedPnl.toFixed(2)),
                    txType,
                    orderId,
                    client,
                );

                // ── 6. Update order status ──
                await this.repo.updateStatus(
                    orderId,
                    'COMPLETE',
                    executionPrice,
                    client,
                );

                // ── 7. Create notification in DB ──
                const notifTitle = `Order Executed`;
                const notifMessage = `${side} ${quantity}x token:${instrumentToken} @ ₹${executionPrice.toLocaleString()}`;
                await this.repo.createNotification(
                    userId,
                    'ORDER_UPDATE',
                    notifTitle,
                    notifMessage,
                    {
                        orderId,
                        side,
                        quantity,
                        instrumentToken,
                        executionPrice,
                        realizedPnl: parseFloat(realizedPnl.toFixed(2)),
                    },
                    client,
                );

                return {
                    success: true,
                    orderId,
                    executionPrice,
                    realizedPnl: parseFloat(realizedPnl.toFixed(2)),
                    newPosition: { quantity: newQuantity, averagePrice: newAvgPrice },
                };
            });

            // ── 8. Publish real-time notification via Redis (outside transaction) ──
            if (result.success) {
                await this.redisPub.publish(
                    `notify:${userId}`,
                    JSON.stringify({
                        type: 'ORDER_EXECUTED',
                        title: 'Order Executed',
                        message: `${side} ${quantity}x token:${instrumentToken} @ ₹${executionPrice}`,
                        data: result,
                    }),
                );
            }

            this.logger.log(
                `✅ Order ${orderId} executed: ${side} ${quantity}x @ ₹${executionPrice} | PnL: ₹${result.realizedPnl}`,
            );

            return result;
        } catch (error) {
            this.logger.error(
                `❌ Order execution failed: ${orderId} — ${(error as Error).message}`,
            );
            throw error; // BullMQ will retry
        }
    }
}
