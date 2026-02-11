import { Provider } from '@nestjs/common';
import Redis from 'ioredis';
import {
    REDIS_PUBLISHER,
    REDIS_SUBSCRIBER,
} from './redis.constants';

export const redisProviders: Provider[] = [
    {
        provide: REDIS_PUBLISHER,
        useFactory: () => {
            const client = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: 6379,
            });

            client.on('connect', () => {
                console.log('Redis Publisher connected');
            });

            client.on('error', (err) => {
                console.error('Redis Publisher error', err);
            });

            return client;
        },
    },
    {
        provide: REDIS_SUBSCRIBER,
        useFactory: () => {
            const client = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: 6379,
            });

            client.on('connect', () => {
                console.log('Redis Subscriber connected');
            });

            client.on('error', (err) => {
                console.error('Redis Subscriber error', err);
            });

            return client;
        },
    },
];
