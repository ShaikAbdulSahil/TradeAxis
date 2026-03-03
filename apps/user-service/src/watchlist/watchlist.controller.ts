import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    UseGuards,
    Req,
} from '@nestjs/common';
import { WatchlistService } from './watchlist.service';
import { JwtAuthGuard } from '@app/common';

@Controller('watchlist')
@UseGuards(JwtAuthGuard)
export class WatchlistController {
    constructor(private readonly watchlistService: WatchlistService) { }

    @Get()
    async getWatchlist(@Req() req: any) {
        return this.watchlistService.getWatchlist(req.user.id);
    }

    @Post()
    async addToWatchlist(
        @Req() req: any,
        @Body() body: { instrument_token: number },
    ) {
        return this.watchlistService.addToWatchlist(
            req.user.id,
            body.instrument_token,
        );
    }

    @Delete(':token')
    async removeFromWatchlist(
        @Req() req: any,
        @Param('token') token: string,
    ) {
        await this.watchlistService.removeFromWatchlist(
            req.user.id,
            parseInt(token, 10),
        );
        return { message: 'Removed from watchlist' };
    }
}
