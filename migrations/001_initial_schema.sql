-- ═══════════════════════════════════════════════════════════
-- TradeAxis: Initial Schema Migration
-- Run against Neon PostgreSQL
-- ═══════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ───────────────────────────────────────────────────────────
-- 1. INSTRUMENTS (Market Data Master Directory)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instruments (
    id SERIAL PRIMARY KEY,
    instrument_token INTEGER UNIQUE NOT NULL,
    exchange_token VARCHAR(20),
    tradingsymbol VARCHAR(50) NOT NULL,
    name VARCHAR(100),
    exchange VARCHAR(10) NOT NULL,
    segment VARCHAR(20),
    tick_size DECIMAL(10, 4),
    lot_size INTEGER,
    instrument_type VARCHAR(10),
    expiry DATE,
    strike_price DECIMAL(10, 2),
    search_vector tsvector
);

CREATE INDEX IF NOT EXISTS idx_instruments_token ON instruments(instrument_token);
CREATE INDEX IF NOT EXISTS idx_instruments_search ON instruments USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_instruments_symbol ON instruments(tradingsymbol);
CREATE INDEX IF NOT EXISTS idx_instruments_exchange ON instruments(exchange);

-- ───────────────────────────────────────────────────────────
-- 2. USERS & AUTH
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(100),
    leverage INTEGER DEFAULT 100,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ───────────────────────────────────────────────────────────
-- 3. WALLETS & VIRTUAL CAPITAL
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    balance DECIMAL(15, 2) DEFAULT 100000.00,
    equity DECIMAL(15, 2) DEFAULT 100000.00,
    used_margin DECIMAL(15, 2) DEFAULT 0.00,
    free_margin DECIMAL(15, 2) DEFAULT 100000.00,
    blocked_margin DECIMAL(15, 2) DEFAULT 0.00,
    is_frozen BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id SERIAL PRIMARY KEY,
    wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL,
    type VARCHAR(30),
    order_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ───────────────────────────────────────────────────────────
-- 4. WATCHLIST
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlist_items (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    instrument_token INTEGER REFERENCES instruments(instrument_token) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, instrument_token)
);

-- ───────────────────────────────────────────────────────────
-- 5. ORDERS
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    instrument_token INTEGER REFERENCES instruments(instrument_token),
    side VARCHAR(10) NOT NULL,
    order_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    quantity INTEGER NOT NULL,
    price DECIMAL(10, 2),
    trigger_price DECIMAL(10, 2),
    stop_limit_price DECIMAL(10, 2),
    average_price DECIMAL(10, 2),
    placed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_token ON orders(instrument_token);

-- ───────────────────────────────────────────────────────────
-- 6. POSITIONS
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    instrument_token INTEGER REFERENCES instruments(instrument_token),
    quantity INTEGER NOT NULL,
    average_price DECIMAL(10, 2) NOT NULL,
    unrealized_pnl DECIMAL(15, 2) DEFAULT 0.00,
    realized_pnl DECIMAL(15, 2) DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, instrument_token)
);

CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_id);

-- ───────────────────────────────────────────────────────────
-- 7. NOTIFICATIONS
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20),
    title VARCHAR(100),
    message TEXT,
    metadata JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- ───────────────────────────────────────────────────────────
-- 8. TRIGGERS
-- ───────────────────────────────────────────────────────────

-- Auto-update search_vector on instruments
CREATE OR REPLACE FUNCTION instruments_search_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector(
      'english',
      coalesce(NEW.name, '') || ' ' || coalesce(NEW.tradingsymbol, '')
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_instruments_search ON instruments;
CREATE TRIGGER trg_instruments_search
BEFORE INSERT OR UPDATE ON instruments
FOR EACH ROW
EXECUTE FUNCTION instruments_search_trigger();

-- Auto-update updated_at on wallets
CREATE OR REPLACE FUNCTION update_wallet_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wallet_updated ON wallets;
CREATE TRIGGER trg_wallet_updated
BEFORE UPDATE ON wallets
FOR EACH ROW
EXECUTE FUNCTION update_wallet_timestamp();

-- Auto-update updated_at on positions
DROP TRIGGER IF EXISTS trg_position_updated ON positions;
CREATE TRIGGER trg_position_updated
BEFORE UPDATE ON positions
FOR EACH ROW
EXECUTE FUNCTION update_wallet_timestamp();

-- ═══════════════════════════════════════════════════════════
-- Migration complete
-- ═══════════════════════════════════════════════════════════
