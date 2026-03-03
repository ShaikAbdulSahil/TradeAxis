import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule, RedisModule } from '@app/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { TickMatcherService } from './tick-matcher.service';
import { OrderExecutionProcessor } from './order-execution.processor';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        RedisModule,
        BullModule.forRoot({
            connection: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379', 10),
            },
        }),
        BullModule.registerQueue({
            name: 'order-execution',
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: 100,
                removeOnFail: 200,
            },
        }),
    ],
    controllers: [OrdersController],
    providers: [
        OrdersService,
        OrdersRepository,
        TickMatcherService,
        OrderExecutionProcessor,
    ],
})
export class OrderServiceModule { }
