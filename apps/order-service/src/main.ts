import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { OrderServiceModule } from './order-service.module';

async function bootstrap() {
    const app = await NestFactory.create(OrderServiceModule);
    const logger = new Logger('OrderService');

    app.enableCors({ origin: '*' });

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    app.setGlobalPrefix('api');

    const port = process.env.ORDER_SERVICE_PORT || 3003;
    await app.listen(port);
    logger.log(`📈 Order Service running on port ${port}`);
}
bootstrap();
