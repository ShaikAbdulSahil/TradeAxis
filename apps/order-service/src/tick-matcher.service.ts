import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { REDIS_SUBSCRIBER, REDIS_CACHE } from '@app/common';
import { PendingOrder, OrderType, OrderSide, TickData } from '@app/common';
import Redis from 'ioredis';

/**
 * Tick Matcher Service
 *
 * Subscribes to Redis tick:* channels and checks pending orders
 * stored in Redis HSET for price matches.
 *
 * When a tick crosses a pending order's target price,
 * the order is pushed to BullMQ for execution.
 */
@Injectable()
export class TickMatcherService implements OnModuleInit {
    private readonly logger = new Logger(TickMatcherService.name);

    constructor(
        @Inject(REDIS_SUBSCRIBER) private readonly redisSub: Redis,
        @Inject(REDIS_CACHE) private readonly redisCache: Redis,
        @InjectQueue('order-execution') private readonly executionQueue: Queue,
    ) { }

    onModuleInit() {
        this.redisSub.psubscribe('tick:*');
        this.redisSub.on('pmessage', (_pattern, channel, message) => {
            const token = channel.split(':')[1];
            this.checkPendingOrders(token, JSON.parse(message)).catch((err) =>
                this.logger.error(`Tick match error for token ${token}: ${err.message}`),
            );
        });
        this.logger.log('Tick matcher initialized, listening to tick:* channels');
    }

    /**
     * Check all pending orders for a given instrument token against the latest tick
     */
    private async checkPendingOrders(token: string, tick: TickData) {
        const pendingRaw = await this.redisCache.hgetall(`pending_orders:${token}`);
        if (!pendingRaw || Object.keys(pendingRaw).length === 0) return;

        const ltp = tick.ltp;

        for (const [orderId, orderJson] of Object.entries(pendingRaw)) {
            const order: PendingOrder = JSON.parse(orderJson);
            const matched = this.isMatchConditionMet(order, ltp);

            if (matched) {
                // Determine execution price
                let executionPrice = ltp;

                // For STOP_LIMIT: the stop has been triggered, now place at limit price
                if (order.order_type === OrderType.STOP_LIMIT && order.stop_limit_price) {
                    executionPrice = order.stop_limit_price;
                }

                // Remove from Redis HSET immediately (prevent double-matching)
                await this.redisCache.hdel(`pending_orders:${token}`, orderId);

                // Push to BullMQ for execution
                await this.executionQueue.add('execute-pending', {
                    orderId: order.id,
                    userId: order.user_id,
                    instrumentToken: order.instrument_token,
                    side: order.side,
                    quantity: order.quantity,
                    executionPrice,
                    orderType: order.order_type,
                });

                this.logger.log(
                    `🎯 Order matched: ${order.side} ${order.quantity}x token:${token} @ ₹${executionPrice} (${order.order_type})`,
                );
            }
        }
    }

    /**
     * Check if the current LTP meets the trigger condition for a pending order
     *
     * LIMIT BUY:  triggers when LTP <= limit price (buy at or below target)
     * LIMIT SELL: triggers when LTP >= limit price (sell at or above target)
     * STOP BUY:   triggers when LTP >= trigger price (breakout upward)
     * STOP SELL:  triggers when LTP <= trigger price (breakout downward)
     * STOP_LIMIT: triggers when STOP condition is met (then executes at limit price)
     */
    private isMatchConditionMet(order: PendingOrder, ltp: number): boolean {
        switch (order.order_type) {
            case OrderType.LIMIT:
                if (order.side === OrderSide.BUY && order.price) {
                    return ltp <= order.price;
                }
                if (order.side === OrderSide.SELL && order.price) {
                    return ltp >= order.price;
                }
                return false;

            case OrderType.STOP:
                if (order.side === OrderSide.BUY && order.trigger_price) {
                    return ltp >= order.trigger_price;
                }
                if (order.side === OrderSide.SELL && order.trigger_price) {
                    return ltp <= order.trigger_price;
                }
                return false;

            case OrderType.STOP_LIMIT:
                // STOP_LIMIT: check if the stop trigger is hit
                if (order.side === OrderSide.BUY && order.trigger_price) {
                    return ltp >= order.trigger_price;
                }
                if (order.side === OrderSide.SELL && order.trigger_price) {
                    return ltp <= order.trigger_price;
                }
                return false;

            default:
                return false;
        }
    }
}
