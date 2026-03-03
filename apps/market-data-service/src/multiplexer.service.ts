import { Injectable, Logger } from '@nestjs/common';
import { AngelOneService } from './angel-one.service';

/**
 * Reference Counting Multiplexer
 *
 * Tracks how many active viewers are watching each instrument token.
 * - When first viewer subscribes (count 0→1): fires subscribe to Angel One
 * - When last viewer leaves (count 1→0): fires unsubscribe to Angel One
 * This prevents duplicate subscriptions and conserves exchange bandwidth.
 */
@Injectable()
export class MultiplexerService {
    private readonly logger = new Logger(MultiplexerService.name);

    // token → number of active viewers
    private readonly refCounts: Map<string, number> = new Map();

    constructor(private readonly angelOne: AngelOneService) { }

    /**
     * Add a viewer for the given tokens.
     * Subscribe to Angel One if this is the first viewer.
     */
    addViewer(tokens: string[]) {
        const newSubscriptions: string[] = [];

        for (const token of tokens) {
            const current = this.refCounts.get(token) || 0;
            this.refCounts.set(token, current + 1);

            if (current === 0) {
                // First viewer — need to subscribe
                newSubscriptions.push(token);
            }
        }

        if (newSubscriptions.length > 0) {
            this.angelOne.subscribe(newSubscriptions);
            this.logger.log(
                `New subscriptions: ${newSubscriptions.length} tokens (${newSubscriptions.slice(0, 3).join(', ')}${newSubscriptions.length > 3 ? '...' : ''})`,
            );
        }
    }

    /**
     * Remove a viewer for the given tokens.
     * Unsubscribe from Angel One if no viewers remain.
     */
    removeViewer(tokens: string[]) {
        const toUnsubscribe: string[] = [];

        for (const token of tokens) {
            const current = this.refCounts.get(token) || 0;
            if (current <= 1) {
                this.refCounts.delete(token);
                toUnsubscribe.push(token);
            } else {
                this.refCounts.set(token, current - 1);
            }
        }

        if (toUnsubscribe.length > 0) {
            this.angelOne.unsubscribe(toUnsubscribe);
            this.logger.log(`Unsubscribed ${toUnsubscribe.length} tokens (no viewers)`);
        }
    }

    /**
     * Get current viewer counts for debugging
     */
    getStats() {
        return {
            totalTokens: this.refCounts.size,
            tokens: Object.fromEntries(this.refCounts),
        };
    }
}
