import { Module } from '@nestjs/common';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';
import { PositionsRepository } from './positions.repository';

@Module({
    controllers: [PositionsController],
    providers: [PositionsService, PositionsRepository],
    exports: [PositionsService],
})
export class PositionsModule { }
