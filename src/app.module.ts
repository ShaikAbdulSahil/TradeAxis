import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [RedisModule, DatabaseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
