import { Module, Global } from '@nestjs/common';
import { redisProviders } from './redis.provider';

@Global()
@Module({
  providers: [...redisProviders],
  exports: [...redisProviders],
})
export class RedisModule { }
