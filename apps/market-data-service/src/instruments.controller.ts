import { Controller, Get, Query } from '@nestjs/common';
import { InstrumentsService } from './instruments.service';

@Controller('instruments')
export class InstrumentsController {
    constructor(private readonly instrumentsService: InstrumentsService) { }

    @Get('search')
    async search(
        @Query('q') query: string,
        @Query('exchange') exchange?: string,
        @Query('limit') limit?: string,
    ) {
        return this.instrumentsService.search(
            query,
            exchange,
            limit ? parseInt(limit, 10) : 20,
        );
    }

    @Get(':token')
    async getByToken(@Query('token') token: string) {
        return this.instrumentsService.getByToken(parseInt(token, 10));
    }
}
