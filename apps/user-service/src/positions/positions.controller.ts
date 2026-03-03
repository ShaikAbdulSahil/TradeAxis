import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { JwtAuthGuard } from '@app/common';

@Controller('positions')
@UseGuards(JwtAuthGuard)
export class PositionsController {
    constructor(private readonly positionsService: PositionsService) { }

    @Get()
    async getOpenPositions(@Req() req: any) {
        return this.positionsService.getOpenPositions(req.user.id);
    }

    @Get('history')
    async getClosedPositions(
        @Req() req: any,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        return this.positionsService.getClosedPositions(
            req.user.id,
            limit ? parseInt(limit, 10) : 50,
            offset ? parseInt(offset, 10) : 0,
        );
    }
}
