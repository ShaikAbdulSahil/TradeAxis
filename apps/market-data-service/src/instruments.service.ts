import { Injectable, Inject, Logger } from '@nestjs/common';
import { REDIS_CACHE, DatabaseService } from '@app/common';
import Redis from 'ioredis';

@Injectable()
export class InstrumentsService {
    private readonly logger = new Logger(InstrumentsService.name);

    constructor(
        private readonly db: DatabaseService,
        @Inject(REDIS_CACHE) private readonly redis: Redis,
    ) { }

    /**
     * Full-text search on instruments with Redis cache for popular searches
     */
    async search(query: string, exchange?: string, limit = 20) {
        if (!query || query.length < 1) return [];

        // Check Redis cache first
        const cacheKey = `search:${query.toLowerCase()}:${exchange || 'all'}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        // Use PostgreSQL full-text search
        const normalizedQuery = query.replace(/\s+/g, ' & ') + ':*';

        let sql = `
      SELECT id, instrument_token, tradingsymbol, name, exchange,
             segment, instrument_type, lot_size
      FROM instruments
      WHERE search_vector @@ to_tsquery('english', $1)
    `;
        const params: any[] = [normalizedQuery];

        if (exchange) {
            sql += ` AND exchange = $2`;
            params.push(exchange);
        }

        sql += ` ORDER BY ts_rank(search_vector, to_tsquery('english', $1)) DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const results = await this.db.query(sql, params);

        // Cache for 60 seconds
        if (results.length > 0) {
            await this.redis.set(cacheKey, JSON.stringify(results), 'EX', 60);
        }

        return results;
    }

    /**
     * Get instrument by token
     */
    async getByToken(token: number) {
        return this.db.queryOne(
            'SELECT * FROM instruments WHERE instrument_token = $1',
            [token],
        );
    }
}
