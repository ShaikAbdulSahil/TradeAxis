import { Module } from '@nestjs/common';
import { KiteService } from './kite.service';

@Module({
  providers: [KiteService]
})
export class KiteModule {}
