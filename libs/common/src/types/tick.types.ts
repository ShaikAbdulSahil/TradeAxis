export interface TickData {
    token: string;
    ltp: number;           // Last Traded Price
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
    change: number | null;        // Absolute change
    change_percent: number | null; // Percentage change
    timestamp: number;     // Unix ms
}
