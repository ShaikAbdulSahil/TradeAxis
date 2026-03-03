import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    UseGuards,
    Req,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '@app/common';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
    constructor(private readonly walletService: WalletService) { }

    @Get()
    async getBalance(@Req() req: any) {
        return this.walletService.getBalance(req.user.id);
    }

    @Post('deposit')
    async deposit(@Req() req: any, @Body() body: { amount: number }) {
        return this.walletService.deposit(req.user.id, body.amount);
    }

    @Get('transactions')
    async getTransactionHistory(
        @Req() req: any,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        return this.walletService.getTransactionHistory(
            req.user.id,
            limit ? parseInt(limit, 10) : 50,
            offset ? parseInt(offset, 10) : 0,
        );
    }
}
