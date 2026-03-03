import { Injectable } from '@nestjs/common';
import { DatabaseService, Notification } from '@app/common';

@Injectable()
export class NotificationsService {
    constructor(private readonly db: DatabaseService) { }

    async getByUserId(userId: string, limit = 30): Promise<Notification[]> {
        return this.db.query<Notification>(
            `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
            [userId, limit],
        );
    }

    async getUnreadCount(userId: string): Promise<number> {
        const result = await this.db.queryOne<{ count: string }>(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
            [userId],
        );
        return parseInt(result?.count || '0', 10);
    }

    async markAsRead(userId: string, notificationId: string): Promise<void> {
        await this.db.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
            [notificationId, userId],
        );
    }

    async markAllAsRead(userId: string): Promise<void> {
        await this.db.query(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
            [userId],
        );
    }

    async create(
        userId: string,
        type: string,
        title: string,
        message: string,
        metadata?: Record<string, any>,
    ): Promise<Notification> {
        const rows = await this.db.query<Notification>(
            `INSERT INTO notifications (user_id, type, title, message, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
            [userId, type, title, message, metadata ? JSON.stringify(metadata) : null],
        );
        return rows[0];
    }
}
