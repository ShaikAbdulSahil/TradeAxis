import { Injectable } from '@nestjs/common';
import { DatabaseService, Order, Wallet, Position } from '@app/common';
import { PoolClient } from 'pg';

@Injectable()
export class OrdersRepository {
    constructor(private readonly db: DatabaseService) { }

    // ─── Orders ──────────────────────────────────────────────

    async create(
        data: {
            user_id: string;
            instrument_token: number;
            side: string;
            order_type: string;
            quantity: number;
            price?: number | null;
            trigger_price?: number | null;
            stop_limit_price?: number | null;
            status?: string;
            average_price?: number | null;
        },
        client?: PoolClient,
    ): Promise<Order> {
        const queryFn = client
            ? (text: string, params: any[]) =>
                client.query(text, params).then((r) => r.rows)
            : (text: string, params: any[]) => this.db.query<Order>(text, params);

        const rows = await queryFn(
            `INSERT INTO orders (user_id, instrument_token, side, order_type, status, quantity, price, trigger_price, stop_limit_price, average_price, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
            [
                data.user_id,
                data.instrument_token,
                data.side,
                data.order_type,
                data.status || 'PENDING',
                data.quantity,
                data.price || null,
                data.trigger_price || null,
                data.stop_limit_price || null,
                data.average_price || null,
                data.status === 'COMPLETE' ? new Date() : null,
            ],
        );
        return rows[0] as Order;
    }

    async updateStatus(
        orderId: string,
        status: string,
        averagePrice?: number,
        client?: PoolClient,
    ): Promise<void> {
        const queryFn = client
            ? (text: string, params: any[]) => client.query(text, params)
            : (text: string, params: any[]) => this.db.query(text, params);

        await queryFn(
            `UPDATE orders
       SET status = $1,
           average_price = COALESCE($2, average_price),
           completed_at = CASE WHEN $1 IN ('COMPLETE', 'REJECTED', 'CANCELLED') THEN NOW() ELSE completed_at END
       WHERE id = $3`,
            [status, averagePrice || null, orderId],
        );
    }

    async findByUserId(userId: string, limit = 50): Promise<Order[]> {
        return this.db.query<Order>(
            `SELECT o.*, i.tradingsymbol, i.name AS instrument_name
       FROM orders o
       JOIN instruments i ON o.instrument_token = i.instrument_token
       WHERE o.user_id = $1
       ORDER BY o.placed_at DESC
       LIMIT $2`,
            [userId, limit],
        );
    }

    async findById(orderId: string): Promise<Order | null> {
        return this.db.queryOne<Order>(
            'SELECT * FROM orders WHERE id = $1',
            [orderId],
        );
    }

    async findPendingByToken(instrumentToken: number): Promise<Order[]> {
        return this.db.query<Order>(
            `SELECT * FROM orders
       WHERE instrument_token = $1 AND status = 'PENDING'`,
            [instrumentToken],
        );
    }

    // ─── Wallet ──────────────────────────────────────────────

    async getWallet(userId: string, client?: PoolClient): Promise<Wallet> {
        const queryFn = client
            ? (text: string, params: any[]) =>
                client.query(text, params).then((r) => r.rows[0])
            : (text: string, params: any[]) => this.db.queryOne<Wallet>(text, params);

        const wallet = await queryFn(
            'SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE',
            [userId],
        );
        return wallet as Wallet;
    }

    async updateWallet(
        userId: string,
        updates: Partial<Wallet>,
        client?: PoolClient,
    ): Promise<void> {
        const queryFn = client
            ? (text: string, params: any[]) => client.query(text, params)
            : (text: string, params: any[]) => this.db.query(text, params);

        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIdx = 1;

        if (updates.balance !== undefined) {
            setClauses.push(`balance = $${paramIdx++}`);
            values.push(updates.balance);
        }
        if (updates.equity !== undefined) {
            setClauses.push(`equity = $${paramIdx++}`);
            values.push(updates.equity);
        }
        if (updates.used_margin !== undefined) {
            setClauses.push(`used_margin = $${paramIdx++}`);
            values.push(updates.used_margin);
        }
        if (updates.free_margin !== undefined) {
            setClauses.push(`free_margin = $${paramIdx++}`);
            values.push(updates.free_margin);
        }
        if (updates.blocked_margin !== undefined) {
            setClauses.push(`blocked_margin = $${paramIdx++}`);
            values.push(updates.blocked_margin);
        }

        if (setClauses.length === 0) return;

        values.push(userId);
        await queryFn(
            `UPDATE wallets SET ${setClauses.join(', ')} WHERE user_id = $${paramIdx}`,
            values,
        );
    }

    async logWalletTransaction(
        walletId: string,
        amount: number,
        type: string,
        orderId?: string,
        client?: PoolClient,
    ): Promise<void> {
        const queryFn = client
            ? (text: string, params: any[]) => client.query(text, params)
            : (text: string, params: any[]) => this.db.query(text, params);

        await queryFn(
            `INSERT INTO wallet_transactions (wallet_id, amount, type, order_id)
       VALUES ($1, $2, $3, $4)`,
            [walletId, amount, type, orderId || null],
        );
    }

    // ─── Positions ───────────────────────────────────────────

    async getPosition(
        userId: string,
        instrumentToken: number,
        client?: PoolClient,
    ): Promise<Position | null> {
        const queryFn = client
            ? (text: string, params: any[]) =>
                client.query(text, params).then((r) => r.rows[0] || null)
            : (text: string, params: any[]) =>
                this.db.queryOne<Position>(text, params);

        return queryFn(
            'SELECT * FROM positions WHERE user_id = $1 AND instrument_token = $2 FOR UPDATE',
            [userId, instrumentToken],
        ) as Promise<Position | null>;
    }

    async upsertPosition(
        userId: string,
        instrumentToken: number,
        quantity: number,
        averagePrice: number,
        realizedPnl: number,
        client?: PoolClient,
    ): Promise<void> {
        const queryFn = client
            ? (text: string, params: any[]) => client.query(text, params)
            : (text: string, params: any[]) => this.db.query(text, params);

        await queryFn(
            `INSERT INTO positions (user_id, instrument_token, quantity, average_price, realized_pnl)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, instrument_token)
       DO UPDATE SET
         quantity = $3,
         average_price = $4,
         realized_pnl = positions.realized_pnl + $5`,
            [userId, instrumentToken, quantity, averagePrice, realizedPnl],
        );
    }

    // ─── Notifications ──────────────────────────────────────

    async createNotification(
        userId: string,
        type: string,
        title: string,
        message: string,
        metadata?: Record<string, any>,
        client?: PoolClient,
    ): Promise<void> {
        const queryFn = client
            ? (text: string, params: any[]) => client.query(text, params)
            : (text: string, params: any[]) => this.db.query(text, params);

        await queryFn(
            `INSERT INTO notifications (user_id, type, title, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
            [userId, type, title, message, metadata ? JSON.stringify(metadata) : null],
        );
    }
}
