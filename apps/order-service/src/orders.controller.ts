import {
    Controller,
    Post,
    Get,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Req,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '@app/common';
import { OrderSide, OrderType } from '@app/common';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    @Post()
    async placeOrder(
        @Req() req: any,
        @Body()
        body: {
            instrument_token: number;
            side: OrderSide;
            order_type: OrderType;
            quantity: number;
            price?: number;
            trigger_price?: number;
            stop_limit_price?: number;
        },
    ) {
        return this.ordersService.placeOrder(req.user.id, body);
    }

    @Get()
    async getOrders(@Req() req: any, @Query('limit') limit?: string) {
        return this.ordersService.getOrders(
            req.user.id,
            limit ? parseInt(limit, 10) : 50,
        );
    }

    @Delete(':id')
    async cancelOrder(@Req() req: any, @Param('id') id: string) {
        return this.ordersService.cancelOrder(req.user.id, id);
    }
}
