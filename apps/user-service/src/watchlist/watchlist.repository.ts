import { Injectable } from '@nestjs/common';
import { DatabaseService, WatchlistItem } from '@app/common';

@Injectable()
export class WatchlistRepository {
    constructor(private readonly db: DatabaseService) { }

    async findByUserId(userId: string): Promise<any[]> {
        return this.db.query(
            `SELECT wi.instrument_token, wi.added_at,
              i.tradingsymbol, i.name, i.exchange, i.segment,
              i.instrument_type, i.lot_size
       FROM watchlist_items wi
       JOIN instruments i ON wi.instrument_token = i.instrument_token
       WHERE wi.user_id = $1
       ORDER BY wi.added_at DESC`,
            [userId],
        );
    }

    async add(userId: string, instrumentToken: number): Promise<WatchlistItem> {
        const rows = await this.db.query<WatchlistItem>(
            `INSERT INTO watchlist_items (user_id, instrument_token)
       VALUES ($1, $2)
       ON CONFLICT (user_id, instrument_token) DO NOTHING
       RETURNING *`,
            [userId, instrumentToken],
        );
        return rows[0];
    }

    async remove(userId: string, instrumentToken: number): Promise<void> {
        await this.db.query(
            'DELETE FROM watchlist_items WHERE user_id = $1 AND instrument_token = $2',
            [userId, instrumentToken],
        );
    }

    async getTokens(userId: string): Promise<number[]> {
        const rows = await this.db.query<{ instrument_token: number }>(
            'SELECT instrument_token FROM watchlist_items WHERE user_id = $1',
            [userId],
        );
        return rows.map((r) => r.instrument_token);
    }
}
