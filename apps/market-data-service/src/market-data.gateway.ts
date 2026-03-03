import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, Logger } from '@nestjs/common';
import { REDIS_SUBSCRIBER } from '@app/common';
import { MultiplexerService } from './multiplexer.service';
import Redis from 'ioredis';

@WebSocketGateway({ cors: { origin: '*' } })
export class MarketDataGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(MarketDataGateway.name);

    // Track which tokens each client is watching (for cleanup on disconnect)
    private clientTokens: Map<string, Set<string>> = new Map();

    constructor(
        @Inject(REDIS_SUBSCRIBER) private readonly redisSub: Redis,
        private readonly multiplexer: MultiplexerService,
    ) { }

    afterInit() {
        // Listen to ALL tick channels from Redis
        this.redisSub.psubscribe('tick:*');
        this.redisSub.on('pmessage', (_pattern, channel, message) => {
            const token = channel.split(':')[1];
            const data = JSON.parse(message);

            // Broadcast to all clients in the room for this token
            this.server.to(`room:${token}`).emit('tick', data);
        });

        this.logger.log('MarketData gateway initialized, listening to tick:* channels');
    }

    handleConnection(client: Socket) {
        this.clientTokens.set(client.id, new Set());
        this.logger.log(`Client connected: ${client.id}`);
    }

    /**
     * Client emits 'watch_tokens' with an array of instrument tokens
     * e.g. socket.emit('watch_tokens', ['2885', '11536', '1594'])
     */
    @SubscribeMessage('watch_tokens')
    handleWatchTokens(client: Socket, tokens: string[]) {
        if (!Array.isArray(tokens) || tokens.length === 0) return;

        const clientSet = this.clientTokens.get(client.id) || new Set();

        // Filter out tokens the client is already watching
        const newTokens = tokens.filter((t) => !clientSet.has(t));
        if (newTokens.length === 0) return;

        // Join Socket.io rooms
        newTokens.forEach((token) => {
            client.join(`room:${token}`);
            clientSet.add(token);
        });

        this.clientTokens.set(client.id, clientSet);

        // Increment reference counts → may trigger Angel One subscribe
        this.multiplexer.addViewer(newTokens);

        this.logger.debug(
            `Client ${client.id} watching ${newTokens.length} new tokens`,
        );
    }

    /**
     * Client emits 'unwatch_tokens' to stop receiving ticks
     */
    @SubscribeMessage('unwatch_tokens')
    handleUnwatchTokens(client: Socket, tokens: string[]) {
        if (!Array.isArray(tokens) || tokens.length === 0) return;

        const clientSet = this.clientTokens.get(client.id);
        if (!clientSet) return;

        const removedTokens = tokens.filter((t) => clientSet.has(t));
        if (removedTokens.length === 0) return;

        removedTokens.forEach((token) => {
            client.leave(`room:${token}`);
            clientSet.delete(token);
        });

        this.multiplexer.removeViewer(removedTokens);
    }

    /**
     * On disconnect, clean up all subscriptions for this client
     */
    handleDisconnect(client: Socket) {
        const clientSet = this.clientTokens.get(client.id);
        if (clientSet && clientSet.size > 0) {
            const tokens = Array.from(clientSet);
            this.multiplexer.removeViewer(tokens);
            this.logger.debug(
                `Client ${client.id} disconnected, released ${tokens.length} tokens`,
            );
        }
        this.clientTokens.delete(client.id);
    }
}
