import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { REDIS_PUBLISHER } from '@app/common';
import { TickData } from '@app/common';
import Redis from 'ioredis';

/**
 * Angel One SmartAPI WebSocket V2 integration.
 * Maintains a single persistent master connection to the exchange.
 *
 * NOTE: SmartAPI SDK is used if available. If the smartapi-javascript
 * package is not installed or credentials fail, the service logs a
 * warning and enters a mock/fallback mode for development.
 */
@Injectable()
export class AngelOneService implements OnModuleInit {
    private readonly logger = new Logger(AngelOneService.name);
    private smartApi: any = null;
    private websocket: any = null;
    private isConnected = false;
    private jwtToken: string | null = null;
    private feedToken: string | null = null;

    // Batch subscribe: accumulate tokens for 50ms before firing
    private pendingSubscribe: Set<string> = new Set();
    private pendingUnsubscribe: Set<string> = new Set();
    private batchTimer: NodeJS.Timeout | null = null;

    constructor(
        @Inject(REDIS_PUBLISHER) private readonly redisPub: Redis,
    ) { }

    async onModuleInit() {
        await this.connect();
    }

    /**
     * Connect to Angel One SmartAPI and establish WebSocket
     */
    async connect() {
        try {
            const { SmartAPI, WebSocketV2 } = await import('smartapi-javascript');
            const otplib = await import('otplib');
            const authenticator = otplib.authenticator || (otplib as any).default?.authenticator;

            if (!authenticator) {
                this.logger.warn('otplib authenticator not available, running in mock mode');
                return;
            }

            const apiKey = process.env.ANGELONE_API_KEY;
            const clientId = process.env.ANGEL_ONE_CLIENT_ID;
            const pin = process.env.ANGEL_ONE_PIN;
            const totpSecret = process.env.TOTP_SECRET;

            if (!apiKey || !clientId || !pin || !totpSecret) {
                this.logger.warn('Angel One credentials missing, running in mock mode');
                return;
            }

            this.smartApi = new SmartAPI({ api_key: apiKey });

            // Generate TOTP
            const totp = authenticator.generate(totpSecret.replace(/\s/g, ''));
            this.logger.log(`Generated TOTP for Angel One login`);

            // Login / Generate Session
            const session = await this.smartApi.generateSession(clientId, pin, totp);
            if (!session.status) {
                this.logger.error(`Angel One login failed: ${session.message}`);
                return;
            }

            this.jwtToken = session.data.jwtToken;
            this.feedToken = session.data.feedToken;
            this.smartApi.setAccessToken(this.jwtToken);
            this.logger.log('✅ Angel One session established');

            // Connect WebSocket
            this.websocket = new WebSocketV2({
                jwttoken: this.jwtToken,
                apikey: apiKey,
                clientcode: clientId,
                feedtype: this.feedToken,
            });

            await this.websocket.connect();

            this.websocket.on('connect', () => {
                this.isConnected = true;
                this.logger.log('✅ Angel One WebSocket connected');
            });

            this.websocket.on('tick', (data: any) => {
                if (data === 'pong') return;
                this.handleTick(data);
            });

            this.websocket.on('error', (err: any) => {
                this.logger.error(`Angel One WS error: ${err}`);
            });

            this.websocket.on('close', () => {
                this.isConnected = false;
                this.logger.warn('Angel One WS disconnected, will retry...');
                setTimeout(() => this.connect(), 5000);
            });
        } catch (err) {
            this.logger.warn(`Angel One init failed: ${(err as Error).message}. Running in mock mode.`);
        }
    }

    /**
     * Handle incoming tick data from Angel One
     * Publish to Redis channel + cache as key-value
     */
    private async handleTick(raw: any) {
        try {
            const token = String(raw.token);
            const tickData: TickData = {
                token,
                ltp: (raw.last_traded_price || 0) / 100,
                open: raw.open_price_of_the_day ? raw.open_price_of_the_day / 100 : null,
                high: raw.high_price_of_the_day ? raw.high_price_of_the_day / 100 : null,
                low: raw.low_price_of_the_day ? raw.low_price_of_the_day / 100 : null,
                close: raw.closed_price ? raw.closed_price / 100 : null,
                volume: raw.volume_trade_for_the_day || null,
                change: null,
                change_percent: null,
                timestamp: Date.now(),
            };

            // Calculate change from close
            if (tickData.close && tickData.close > 0) {
                tickData.change = parseFloat((tickData.ltp - tickData.close).toFixed(2));
                tickData.change_percent = parseFloat(
                    ((tickData.change / tickData.close) * 100).toFixed(2),
                );
            }

            const payload = JSON.stringify(tickData);

            // Fan-out: cache + publish in parallel
            await Promise.all([
                this.redisPub.set(`tick:${token}`, payload, 'EX', 300), // 5min TTL
                this.redisPub.publish(`tick:${token}`, payload),
            ]);
        } catch (err) {
            this.logger.error(`Tick processing error: ${(err as Error).message}`);
        }
    }

    /**
     * Subscribe to tokens with smart batching (50ms window)
     */
    subscribe(tokens: string[]) {
        tokens.forEach((t) => this.pendingSubscribe.add(t));
        this.scheduleBatch();
    }

    /**
     * Unsubscribe from tokens
     */
    unsubscribe(tokens: string[]) {
        tokens.forEach((t) => this.pendingUnsubscribe.add(t));
        this.scheduleBatch();
    }

    private scheduleBatch() {
        if (this.batchTimer) return;
        this.batchTimer = setTimeout(() => this.flushBatch(), 50);
    }

    private flushBatch() {
        this.batchTimer = null;

        if (this.pendingSubscribe.size > 0 && this.isConnected && this.websocket) {
            const tokens = Array.from(this.pendingSubscribe);
            this.pendingSubscribe.clear();

            this.websocket.fetchData({
                correlationId: `sub_${Date.now()}`,
                action: 1, // Subscribe
                mode: 3,   // Full mode (OHLCV)
                exchangeType: 1, // NSE
                tokens,
            });

            this.logger.log(`Subscribed to ${tokens.length} tokens: [${tokens.slice(0, 5).join(', ')}${tokens.length > 5 ? '...' : ''}]`);
        }

        if (this.pendingUnsubscribe.size > 0 && this.isConnected && this.websocket) {
            const tokens = Array.from(this.pendingUnsubscribe);
            this.pendingUnsubscribe.clear();

            this.websocket.fetchData({
                correlationId: `unsub_${Date.now()}`,
                action: 0, // Unsubscribe
                mode: 3,
                exchangeType: 1,
                tokens,
            });

            this.logger.log(`Unsubscribed from ${tokens.length} tokens`);
        }
    }

    getConnectionStatus(): boolean {
        return this.isConnected;
    }
}
