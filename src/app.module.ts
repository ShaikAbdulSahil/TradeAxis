import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { DatabaseModule } from './database/database.module';
import { ServiceModule } from './kite/service/service.module';
import { KiteModule } from './kite/kite.module';
import { TickerModule } from './ticker/ticker.module';

@Module({
  imports: [RedisModule, DatabaseModule, ServiceModule, KiteModule, TickerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
