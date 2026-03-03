import { Provider, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_PUBLISHER, REDIS_SUBSCRIBER, REDIS_CACHE } from './redis.constants';

const logger = new Logger('RedisProvider');

function createRedisClient(name: string): Redis {
    const client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        maxRetriesPerRequest: null, // Required by BullMQ
        retryStrategy: (times: number) => {
            if (times > 10) return null; // Stop retrying
            return Math.min(times * 200, 2000);
        },
    });

    client.on('connect', () => logger.log(`Redis ${name} connected`));
    client.on('error', (err) => logger.error(`Redis ${name} error: ${err.message}`));

    return client;
}

export const redisProviders: Provider[] = [
    {
        provide: REDIS_PUBLISHER,
        useFactory: () => createRedisClient('Publisher'),
    },
    {
        provide: REDIS_SUBSCRIBER,
        useFactory: () => createRedisClient('Subscriber'),
    },
    {
        provide: REDIS_CACHE,
        useFactory: () => createRedisClient('Cache'),
    },
];
