export enum UserStatus {
    ACTIVE = 'ACTIVE',
    LOCKED_BY_ADMIN = 'LOCKED_BY_ADMIN',
    SUSPENDED = 'SUSPENDED',
}

export interface User {
    id: string;
    email: string;
    password_hash: string;
    full_name: string | null;
    leverage: number;
    status: UserStatus;
    created_at: Date;
}

export interface Wallet {
    id: string;
    user_id: string;
    balance: number;
    equity: number;
    used_margin: number;
    free_margin: number;
    blocked_margin: number;
    is_frozen: boolean;
    updated_at: Date;
}

export interface Position {
    id: string;
    user_id: string;
    instrument_token: number;
    quantity: number;
    average_price: number;
    unrealized_pnl: number;
    realized_pnl: number;
    updated_at: Date;
}

export interface WatchlistItem {
    user_id: string;
    instrument_token: number;
    added_at: Date;
}

export interface Notification {
    id: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
    metadata: Record<string, any> | null;
    is_read: boolean;
    created_at: Date;
}

export interface Instrument {
    id: number;
    instrument_token: number;
    exchange_token: string | null;
    tradingsymbol: string;
    name: string | null;
    exchange: string;
    segment: string | null;
    tick_size: number | null;
    lot_size: number | null;
    instrument_type: string | null;
    expiry: Date | null;
    strike_price: number | null;
}
