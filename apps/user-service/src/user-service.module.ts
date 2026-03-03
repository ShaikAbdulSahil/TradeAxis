import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule, RedisModule } from '@app/common';
import { AuthModule } from './auth/auth.module';
import { WalletModule } from './wallet/wallet.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { PositionsModule } from './positions/positions.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        RedisModule,
        AuthModule,
        WalletModule,
        WatchlistModule,
        PositionsModule,
        NotificationsModule,
    ],
})
export class UserServiceModule { }
