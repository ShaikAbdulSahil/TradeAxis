import {
    Injectable,
    ConflictException,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { UserRepository } from './user.repository';
import { DatabaseService } from '@app/common';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly userRepo: UserRepository,
        private readonly db: DatabaseService,
    ) { }

    /**
     * Register a new user. Creates user + wallet in a single transaction.
     */
    async register(email: string, password: string, fullName: string) {
        // Check if user already exists
        const existing = await this.userRepo.findByEmail(email);
        if (existing) {
            throw new ConflictException('Email already registered');
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Transaction: create user + wallet atomically
        const result = await this.db.transaction(async (client) => {
            const userResult = await client.query(
                `INSERT INTO users (email, password_hash, full_name)
         VALUES ($1, $2, $3)
         RETURNING id, email, full_name, leverage, status, created_at`,
                [email, passwordHash, fullName],
            );
            const user = userResult.rows[0];

            // Create wallet with default virtual balance
            await client.query(
                `INSERT INTO wallets (user_id, balance, equity, free_margin)
         VALUES ($1, 100000.00, 100000.00, 100000.00)`,
                [user.id],
            );

            return user;
        });

        const token = this.generateToken(result);
        this.logger.log(`New user registered: ${email}`);

        return {
            user: {
                id: result.id,
                email: result.email,
                full_name: result.full_name,
                leverage: result.leverage,
                status: result.status,
            },
            token,
        };
    }

    /**
     * Login with email + password, return JWT
     */
    async login(email: string, password: string) {
        const user = await this.userRepo.findByEmail(email);
        if (!user) {
            throw new UnauthorizedException('Invalid email or password');
        }

        if (user.status !== 'ACTIVE') {
            throw new UnauthorizedException('Account is locked or suspended');
        }

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            throw new UnauthorizedException('Invalid email or password');
        }

        const token = this.generateToken(user);

        return {
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                leverage: user.leverage,
                status: user.status,
            },
            token,
        };
    }

    /**
     * Get user profile by ID (for authenticated requests)
     */
    async getProfile(userId: string) {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new UnauthorizedException('User not found');
        }
        return {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            leverage: user.leverage,
            status: user.status,
            created_at: user.created_at,
        };
    }

    private generateToken(user: any): string {
        const secret: jwt.Secret = process.env.JWT_SECRET || 'fallback_secret';

        return jwt.sign(
            { sub: user.id, email: user.email },
            secret,
            { expiresIn: process.env.JWT_EXPIRATION || '7d' } as jwt.SignOptions,
        );
    }
}
