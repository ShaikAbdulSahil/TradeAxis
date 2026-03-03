import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { WalletRepository } from './wallet.repository';

@Injectable()
export class WalletService {
    constructor(private readonly walletRepo: WalletRepository) { }

    async getBalance(userId: string) {
        const wallet = await this.walletRepo.findByUserId(userId);
        if (!wallet) throw new NotFoundException('Wallet not found');

        return {
            balance: Number(wallet.balance),
            equity: Number(wallet.equity),
            used_margin: Number(wallet.used_margin),
            free_margin: Number(wallet.free_margin),
            blocked_margin: Number(wallet.blocked_margin),
            is_frozen: wallet.is_frozen,
        };
    }

    async deposit(userId: string, amount: number) {
        if (amount <= 0) {
            throw new BadRequestException('Deposit amount must be positive');
        }

        const wallet = await this.walletRepo.findByUserId(userId);
        if (!wallet) throw new NotFoundException('Wallet not found');
        if (wallet.is_frozen) {
            throw new BadRequestException('Wallet is frozen');
        }

        const updated = await this.walletRepo.deposit(userId, amount);

        await this.walletRepo.logTransaction(
            wallet.id,
            amount,
            'VIRTUAL_DEPOSIT',
        );

        return {
            balance: Number(updated.balance),
            equity: Number(updated.equity),
            free_margin: Number(updated.free_margin),
            message: `Successfully deposited ₹${amount.toLocaleString()}`,
        };
    }

    async getTransactionHistory(userId: string, limit = 50, offset = 0) {
        const wallet = await this.walletRepo.findByUserId(userId);
        if (!wallet) throw new NotFoundException('Wallet not found');

        return this.walletRepo.getTransactionHistory(wallet.id, limit, offset);
    }
}
