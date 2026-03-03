import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, PoolClient, QueryResult } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
    private readonly pool: Pool;
    private readonly logger = new Logger(DatabaseService.name);

    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });

        this.pool.on('connect', () => {
            this.logger.log('New client connected to PostgreSQL pool');
        });

        this.pool.on('error', (err) => {
            this.logger.error('PostgreSQL pool error', err.stack);
        });
    }

    /**
     * Execute a query and return rows
     */
    async query<T = any>(text: string, params?: any[]): Promise<T[]> {
        const start = Date.now();
        const result: QueryResult = await this.pool.query(text, params);
        const duration = Date.now() - start;

        this.logger.debug(
            `Query executed in ${duration}ms | rows: ${result.rowCount}`,
        );
        return result.rows as T[];
    }

    /**
     * Execute a query and return the first row or null
     */
    async queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
        const rows = await this.query<T>(text, params);
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Get a client from the pool for transactions
     */
    async getClient(): Promise<PoolClient> {
        return this.pool.connect();
    }

    /**
     * Execute operations within a database transaction.
     * Automatically commits on success, rolls back on error.
     */
    async transaction<T>(
        callback: (client: PoolClient) => Promise<T>,
    ): Promise<T> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async onModuleDestroy() {
        await this.pool.end();
        this.logger.log('PostgreSQL pool closed');
    }
}
