import { Module } from '@nestjs/common';
import { TickerGateway } from './ticker.gateway';

@Module({
  providers: [TickerGateway]
})
export class TickerModule {}
