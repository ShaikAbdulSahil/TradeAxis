import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { UserServiceModule } from './user-service.module';

async function bootstrap() {
    const app = await NestFactory.create(UserServiceModule);
    const logger = new Logger('UserService');

    app.enableCors({
        origin: '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        credentials: true,
    });

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    app.setGlobalPrefix('api');

    const port = process.env.USER_SERVICE_PORT || 3001;
    await app.listen(port);
    logger.log(`🚀 User Service running on port ${port}`);
}
bootstrap();
