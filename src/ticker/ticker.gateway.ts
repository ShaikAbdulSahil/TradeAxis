import { Inject } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true })
export class TickerGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(@Inject('REDIS_SUBSCRIBER') private readonly redisub) { }

  afterInit() {
    this.redisub.psubscribe('chan:*');
    this.redisub.on('pmessage', (pattern, channel, message) => {
      const symbol = channel.split(':')[1];
      const data = JSON.parse(message);
      //push to the specific socket room for that symbol
      this.server.to(`room:${symbol}`).emit('priceUpdate', data);
    });
  }
  @SubscribeMessage('watch')
  handleWatch(client: Socket, symbol: string) {
    client.join(`room:${symbol}`);
  }

  async handleConnection(client: Socket) {
      try {
        // 1. Extract & Verify JWT (Assume you have an AuthService)
        // const token = client.handshake.auth.token;
        // const user = await this.authService.verifyToken(token);

        // 2. Attach user data to the socket for easy access
        // client.data.userId = user.id;

        // 3. Join the "User Room" (Multi-device support)
        // const userRoom = `user_${user.id}`;
        // client.join(userRoom);

        console.log(`User connected with socket ${client.id}`);
      } catch (e) {
        client.disconnect(); // Reject unauthenticated connections
      }
    }
}
