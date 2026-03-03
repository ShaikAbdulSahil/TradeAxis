import { Injectable, Inject } from '@nestjs/common';
import { WatchlistRepository } from './watchlist.repository';
import { REDIS_CACHE } from '@app/common';
import Redis from 'ioredis';

@Injectable()
export class WatchlistService {
    constructor(
        private readonly watchlistRepo: WatchlistRepository,
        @Inject(REDIS_CACHE) private readonly redis: Redis,
    ) { }

    async getWatchlist(userId: string) {
        const items = await this.watchlistRepo.findByUserId(userId);

        // Enrich with live LTP from Redis cache
        const enriched = await Promise.all(
            items.map(async (item) => {
                const cached = await this.redis.get(`tick:${item.instrument_token}`);
                const tickData = cached ? JSON.parse(cached) : null;
                return {
                    ...item,
                    ltp: tickData?.ltp || null,
                    change: tickData?.change || null,
                    change_percent: tickData?.change_percent || null,
                };
            }),
        );

        return enriched;
    }

    async addToWatchlist(userId: string, instrumentToken: number) {
        return this.watchlistRepo.add(userId, instrumentToken);
    }

    async removeFromWatchlist(userId: string, instrumentToken: number) {
        return this.watchlistRepo.remove(userId, instrumentToken);
    }

    async getWatchlistTokens(userId: string): Promise<number[]> {
        return this.watchlistRepo.getTokens(userId);
    }
}
