import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@app/common';
import { User } from '@app/common';

@Injectable()
export class UserRepository {
    constructor(private readonly db: DatabaseService) { }

    async findByEmail(email: string): Promise<User | null> {
        return this.db.queryOne<User>(
            'SELECT * FROM users WHERE email = $1',
            [email],
        );
    }

    async findById(id: string): Promise<User | null> {
        return this.db.queryOne<User>(
            'SELECT * FROM users WHERE id = $1',
            [id],
        );
    }

    async create(
        email: string,
        passwordHash: string,
        fullName: string,
    ): Promise<User> {
        const rows = await this.db.query<User>(
            `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING *`,
            [email, passwordHash, fullName],
        );
        return rows[0];
    }

    async updateStatus(userId: string, status: string): Promise<void> {
        await this.db.query(
            'UPDATE users SET status = $1 WHERE id = $2',
            [status, userId],
        );
    }
}
