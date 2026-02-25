-- ============================================================================
-- EasyPoly Telegram Copy Trading Bot - Initial Schema
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TELEGRAM USERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    wallet_address TEXT,
    privy_user_id TEXT,
    balance DECIMAL(20, 6) DEFAULT 0,
    total_profit DECIMAL(20, 6) DEFAULT 0,
    total_loss DECIMAL(20, 6) DEFAULT 0,
    settings JSONB DEFAULT '{"notifications": true, "daily_picks": true, "copy_alerts": true, "max_bet_amount": 50, "auto_copy_enabled": false}'::jsonb,
    referral_code TEXT UNIQUE,
    referred_by UUID REFERENCES telegram_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_telegram_users_telegram_id ON telegram_users(telegram_id);
CREATE INDEX idx_telegram_users_referral_code ON telegram_users(referral_code);
CREATE INDEX idx_telegram_users_wallet ON telegram_users(wallet_address);

-- ============================================================================
-- COPY TRADES (User -> Trader Relationships)
-- ============================================================================

CREATE TABLE IF NOT EXISTS copy_trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
    trader_address TEXT NOT NULL,
    trader_name TEXT,
    amount_per_trade DECIMAL(20, 6) NOT NULL,
    max_daily_amount DECIMAL(20, 6),
    stop_loss_percent DECIMAL(5, 2),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'inactive')),
    custom_trader BOOLEAN DEFAULT false,
    total_copied INTEGER DEFAULT 0,
    total_profit DECIMAL(20, 6) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_copy_trades_user_id ON copy_trades(user_id);
CREATE INDEX idx_copy_trades_trader_address ON copy_trades(trader_address);
CREATE INDEX idx_copy_trades_status ON copy_trades(status);

-- ============================================================================
-- BOT TRADES (Executed Trades)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
    copy_trade_id UUID REFERENCES copy_trades(id),
    market_id TEXT NOT NULL,
    market_title TEXT,
    amount DECIMAL(20, 6) NOT NULL,
    outcome TEXT NOT NULL,
    price DECIMAL(10, 6),
    shares DECIMAL(20, 6),
    order_type TEXT DEFAULT 'market' CHECK (order_type IN ('market', 'limit')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'closed', 'cancelled')),
    pnl DECIMAL(20, 6) DEFAULT 0,
    pnl_percent DECIMAL(10, 4) DEFAULT 0,
    resolution_price DECIMAL(10, 6),
    resolved_at TIMESTAMP WITH TIME ZONE,
    tx_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_bot_trades_user_id ON bot_trades(user_id);
CREATE INDEX idx_bot_trades_market_id ON bot_trades(market_id);
CREATE INDEX idx_bot_trades_status ON bot_trades(status);
CREATE INDEX idx_bot_trades_created_at ON bot_trades(created_at DESC);

-- ============================================================================
-- REFERRALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
    referred_id UUID NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
    earnings DECIMAL(20, 6) DEFAULT 0,
    total_referred_trades INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(referrer_id, referred_id)
);

CREATE INDEX idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred_id ON referrals(referred_id);

-- ============================================================================
-- TRADER MONITORING (Track copied trader activity)
-- ============================================================================

CREATE TABLE IF NOT EXISTS trader_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trader_address TEXT NOT NULL,
    market_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    amount DECIMAL(20, 6) NOT NULL,
    price DECIMAL(10, 6),
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    copied_by_users INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_trader_activity_trader_address ON trader_activity(trader_address);
CREATE INDEX idx_trader_activity_detected_at ON trader_activity(detected_at DESC);

-- ============================================================================
-- NOTIFICATIONS QUEUE
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    metadata JSONB,
    sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notification_queue_user_id ON notification_queue(user_id);
CREATE INDEX idx_notification_queue_sent ON notification_queue(sent);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_telegram_users_updated_at BEFORE UPDATE ON telegram_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_copy_trades_updated_at BEFORE UPDATE ON copy_trades
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bot_trades_updated_at BEFORE UPDATE ON bot_trades
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_referrals_updated_at BEFORE UPDATE ON referrals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS FOR ANALYTICS
-- ============================================================================

-- User performance summary
CREATE OR REPLACE VIEW user_performance AS
SELECT 
    u.id,
    u.telegram_id,
    u.username,
    u.balance,
    COUNT(DISTINCT bt.id) as total_trades,
    COUNT(DISTINCT CASE WHEN bt.status = 'active' THEN bt.id END) as active_positions,
    SUM(CASE WHEN bt.pnl > 0 THEN bt.pnl ELSE 0 END) as total_wins,
    SUM(CASE WHEN bt.pnl < 0 THEN bt.pnl ELSE 0 END) as total_losses,
    COALESCE(SUM(bt.pnl), 0) as net_pnl,
    CASE 
        WHEN COUNT(DISTINCT bt.id) > 0 
        THEN ROUND((COUNT(DISTINCT CASE WHEN bt.pnl > 0 THEN bt.id END)::decimal / COUNT(DISTINCT bt.id)::decimal) * 100, 2)
        ELSE 0 
    END as win_rate_percent
FROM telegram_users u
LEFT JOIN bot_trades bt ON u.id = bt.user_id AND bt.status IN ('closed', 'active')
GROUP BY u.id, u.telegram_id, u.username, u.balance;

-- Copy trading performance
CREATE OR REPLACE VIEW copy_trade_performance AS
SELECT 
    ct.id,
    ct.user_id,
    ct.trader_address,
    ct.trader_name,
    ct.amount_per_trade,
    ct.status,
    COUNT(DISTINCT bt.id) as total_trades,
    COALESCE(SUM(bt.pnl), 0) as total_pnl,
    AVG(bt.pnl_percent) as avg_pnl_percent,
    ct.created_at
FROM copy_trades ct
LEFT JOIN bot_trades bt ON ct.id = bt.copy_trade_id
GROUP BY ct.id, ct.user_id, ct.trader_address, ct.trader_name, 
         ct.amount_per_trade, ct.status, ct.created_at;
