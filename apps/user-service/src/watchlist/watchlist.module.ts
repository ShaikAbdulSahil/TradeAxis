import { Module } from '@nestjs/common';
import { WatchlistController } from './watchlist.controller';
import { WatchlistService } from './watchlist.service';
import { WatchlistRepository } from './watchlist.repository';

@Module({
    controllers: [WatchlistController],
    providers: [WatchlistService, WatchlistRepository],
    exports: [WatchlistService],
})
export class WatchlistModule { }
