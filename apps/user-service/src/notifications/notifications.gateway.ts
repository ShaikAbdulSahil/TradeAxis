import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, Logger } from '@nestjs/common';
import { REDIS_SUBSCRIBER } from '@app/common';
import { NotificationsService } from './notifications.service';
import * as jwt from 'jsonwebtoken';
import Redis from 'ioredis';

@WebSocketGateway({
    cors: { origin: '*' },
    namespace: '/notifications',
})
export class NotificationsGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(NotificationsGateway.name);

    constructor(
        @Inject(REDIS_SUBSCRIBER) private readonly redisSub: Redis,
        private readonly notificationsService: NotificationsService,
    ) { }

    afterInit() {
        // Listen for notification events published by the Order Service
        this.redisSub.psubscribe('notify:*');
        this.redisSub.on('pmessage', (_pattern, channel, message) => {
            const userId = channel.split(':')[1];
            const data = JSON.parse(message);

            // Push to the user's private room
            this.server.to(`user:${userId}`).emit('notification', data);
            this.logger.debug(`Pushed notification to user:${userId}`);
        });
    }

    handleConnection(client: Socket) {
        try {
            const token =
                client.handshake.auth?.token ||
                client.handshake.headers?.authorization?.split(' ')[1];

            if (!token) {
                client.disconnect();
                return;
            }

            const secret = process.env.JWT_SECRET || 'fallback_secret';
            const decoded = jwt.verify(token, secret) as any;
            const userId = decoded.sub;

            // Join private user room
            client.join(`user:${userId}`);
            client.data.userId = userId;

            this.logger.log(`User ${userId} connected to notifications`);
        } catch (err) {
            this.logger.warn('Unauthorized WS connection attempt');
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        if (client.data?.userId) {
            this.logger.log(`User ${client.data.userId} disconnected from notifications`);
        }
    }
}
