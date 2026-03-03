import { Injectable, Inject } from '@nestjs/common';
import { PositionsRepository } from './positions.repository';
import { REDIS_CACHE } from '@app/common';
import Redis from 'ioredis';

@Injectable()
export class PositionsService {
    constructor(
        private readonly positionsRepo: PositionsRepository,
        @Inject(REDIS_CACHE) private readonly redis: Redis,
    ) { }

    /**
     * Get open positions enriched with live PnL from Redis-cached LTP
     */
    async getOpenPositions(userId: string) {
        const positions = await this.positionsRepo.findOpenByUserId(userId);

        const enriched = await Promise.all(
            positions.map(async (pos) => {
                const cached = await this.redis.get(`tick:${pos.instrument_token}`);
                const ltp = cached ? JSON.parse(cached).ltp : null;

                const unrealizedPnl = ltp
                    ? (ltp - Number(pos.average_price)) * pos.quantity
                    : Number(pos.unrealized_pnl);

                return {
                    ...pos,
                    average_price: Number(pos.average_price),
                    realized_pnl: Number(pos.realized_pnl),
                    unrealized_pnl: parseFloat(unrealizedPnl.toFixed(2)),
                    ltp,
                };
            }),
        );

        return enriched;
    }

    /**
     * Get closed position history
     */
    async getClosedPositions(userId: string, limit = 50, offset = 0) {
        return this.positionsRepo.findClosedByUserId(userId, limit, offset);
    }
}
