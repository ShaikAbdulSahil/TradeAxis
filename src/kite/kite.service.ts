import { Injectable, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import yahooFinance from 'yahoo-finance2';
import { REDIS_PUBLISHER } from '../redis/redis.constants';

@Injectable() export class KiteService {
    constructor(@Inject(REDIS_PUBLISHER) private readonly redis) { }

    private activeSymbols = ['RELIANCE.NS', 'TCS.NS', 'ZOMATO.NS', 'INFY.NS'];

    @Cron('*/2 * * * * *') // Every 2 seconds
    async pullData() {
        try {
            const results = await yahooFinance.quote(this.activeSymbols) as any;
            const stockResults = Array.isArray(results) ? results : [results];

            for (const stock of stockResults) {
                const symbol = stock.symbol.replace('.NS', '');
                const tickData = {
                    symbol,
                    lp: stock.regularMarketPrice,           // Last Price
                    pc: stock.regularMarketChangePercent,  // Percent Change
                    h: stock.regularMarketDayHigh,         // Day High
                    l: stock.regularMarketDayLow,          // Day Low
                    t: Date.now()                          // Timestamp
                };

                // Push to the Redis logic we defined above
                await this.redis.set(`ticker:${symbol}`, JSON.stringify(tickData));
                await this.redis.publish(`chann:${symbol}`, JSON.stringify(tickData));
            }
        }
        catch (error) {
            console.error('Error pulling data:', error);
        }
    }
}