import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@app/common';
import { AngelOneService } from './angel-one.service';
import { MultiplexerService } from './multiplexer.service';
import { MarketDataGateway } from './market-data.gateway';
import { InstrumentsController } from './instruments.controller';
import { InstrumentsService } from './instruments.service';
import { DatabaseModule } from '@app/common';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        RedisModule,
        DatabaseModule,
    ],
    controllers: [InstrumentsController],
    providers: [
        AngelOneService,
        MultiplexerService,
        MarketDataGateway,
        InstrumentsService,
    ],
})
export class MarketDataModule { }
