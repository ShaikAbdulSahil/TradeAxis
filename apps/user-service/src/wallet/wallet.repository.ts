import { Injectable } from '@nestjs/common';
import { DatabaseService, Wallet } from '@app/common';

@Injectable()
export class WalletRepository {
    constructor(private readonly db: DatabaseService) { }

    async findByUserId(userId: string): Promise<Wallet | null> {
        return this.db.queryOne<Wallet>(
            'SELECT * FROM wallets WHERE user_id = $1',
            [userId],
        );
    }

    async deposit(userId: string, amount: number): Promise<Wallet> {
        const rows = await this.db.query<Wallet>(
            `UPDATE wallets
       SET balance = balance + $2,
           equity = equity + $2,
           free_margin = free_margin + $2
       WHERE user_id = $1
       RETURNING *`,
            [userId, amount],
        );
        return rows[0];
    }

    async logTransaction(
        walletId: string,
        amount: number,
        type: string,
        orderId?: string,
    ): Promise<void> {
        await this.db.query(
            `INSERT INTO wallet_transactions (wallet_id, amount, type, order_id)
       VALUES ($1, $2, $3, $4)`,
            [walletId, amount, type, orderId || null],
        );
    }

    async getTransactionHistory(
        walletId: string,
        limit = 50,
        offset = 0,
    ): Promise<any[]> {
        return this.db.query(
            `SELECT * FROM wallet_transactions
       WHERE wallet_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
            [walletId, limit, offset],
        );
    }
}
