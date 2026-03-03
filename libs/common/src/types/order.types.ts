export enum OrderSide {
    BUY = 'BUY',
    SELL = 'SELL',
}

export enum OrderType {
    MARKET = 'MARKET',
    LIMIT = 'LIMIT',
    STOP = 'STOP',
    STOP_LIMIT = 'STOP_LIMIT',
}

export enum OrderStatus {
    PENDING = 'PENDING',
    COMPLETE = 'COMPLETE',
    REJECTED = 'REJECTED',
    CANCELLED = 'CANCELLED',
}

export interface Order {
    id: string;
    user_id: string;
    instrument_token: number;
    side: OrderSide;
    order_type: OrderType;
    status: OrderStatus;
    quantity: number;
    price: number | null;
    trigger_price: number | null;
    stop_limit_price: number | null;
    average_price: number | null;
    placed_at: Date;
    completed_at: Date | null;
}

/**
 * Shape of a pending order stored in Redis HSET
 * Key: pending_orders:{instrument_token}
 * Field: order.id
 * Value: JSON stringified PendingOrder
 */
export interface PendingOrder {
    id: string;
    user_id: string;
    instrument_token: number;
    side: OrderSide;
    order_type: OrderType;
    quantity: number;
    price: number | null;          // Limit price
    trigger_price: number | null;  // Stop trigger
    stop_limit_price: number | null;
}
