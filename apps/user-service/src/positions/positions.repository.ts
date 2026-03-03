import { Injectable } from '@nestjs/common';
import { DatabaseService, Position } from '@app/common';

@Injectable()
export class PositionsRepository {
    constructor(private readonly db: DatabaseService) { }

    async findOpenByUserId(userId: string): Promise<Position[]> {
        return this.db.query<Position>(
            `SELECT p.*, i.tradingsymbol, i.name AS instrument_name, i.exchange
       FROM positions p
       JOIN instruments i ON p.instrument_token = i.instrument_token
       WHERE p.user_id = $1 AND p.quantity != 0
       ORDER BY p.updated_at DESC`,
            [userId],
        );
    }

    async findClosedByUserId(userId: string, limit = 50, offset = 0): Promise<Position[]> {
        return this.db.query<Position>(
            `SELECT p.*, i.tradingsymbol, i.name AS instrument_name, i.exchange
       FROM positions p
       JOIN instruments i ON p.instrument_token = i.instrument_token
       WHERE p.user_id = $1 AND p.quantity = 0
       ORDER BY p.updated_at DESC
       LIMIT $2 OFFSET $3`,
            [userId, limit, offset],
        );
    }

    async findByUserAndToken(userId: string, instrumentToken: number): Promise<Position | null> {
        return this.db.queryOne<Position>(
            'SELECT * FROM positions WHERE user_id = $1 AND instrument_token = $2',
            [userId, instrumentToken],
        );
    }
}
