import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { MarketDataModule } from './market-data.module';

async function bootstrap() {
    const app = await NestFactory.create(MarketDataModule);
    const logger = new Logger('MarketDataService');

    app.enableCors({ origin: '*' });

    const port = process.env.MARKET_DATA_SERVICE_PORT || 3002;
    await app.listen(port);
    logger.log(`📡 Market Data Service running on port ${port}`);
}
bootstrap();
