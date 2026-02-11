import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {Pool} from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
    private readonly pool: Pool;

    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false,
            },
            max: 10,
        });
    }

    async query<T = any>(text: string, params?: any[]): Promise<T[]> {
        const result = await this.pool.query(text, params);
        return result.rows as T[];
    }

    async onModuleDestroy() {
        await this.pool.end();
    }
}
