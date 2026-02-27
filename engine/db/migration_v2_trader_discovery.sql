-- Migration: Market-First Trader Discovery v2.0
-- ================================================
-- Adds new fields to ep_tracked_traders for lifecycle states, category specialists,
-- rising star detection, and market specialization tracking.
--
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ljseawnwxbkrejwysrey/editor

-- 1. Add lifecycle_state field (hot/consistent/cooling/cold)
ALTER TABLE ep_tracked_traders
ADD COLUMN IF NOT EXISTS lifecycle_state TEXT DEFAULT 'unknown';

-- 2. Add rising_star flag (hidden gems with strong recent performance)
ALTER TABLE ep_tracked_traders
ADD COLUMN IF NOT EXISTS rising_star BOOLEAN DEFAULT FALSE;

-- 3. Add category_win_rates (per-category performance breakdown)
-- Example: {"crypto": 85.5, "politics": 60.0, "sports": 72.3}
ALTER TABLE ep_tracked_traders
ADD COLUMN IF NOT EXISTS category_win_rates JSONB DEFAULT '{}'::jsonb;

-- 4. Add markets_specialized (array of market IDs where trader dominates)
-- Example: ["0x1a2b3c4d...", "0x5e6f7g8h..."]
ALTER TABLE ep_tracked_traders
ADD COLUMN IF NOT EXISTS markets_specialized TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 5. Add last_hot_streak_date (timestamp of most recent hot streak)
ALTER TABLE ep_tracked_traders
ADD COLUMN IF NOT EXISTS last_hot_streak_date TIMESTAMPTZ;

-- 6. Create index on lifecycle_state for fast filtering
CREATE INDEX IF NOT EXISTS idx_ep_tracked_traders_lifecycle
ON ep_tracked_traders(lifecycle_state);

-- 7. Create index on rising_star for quick discovery
CREATE INDEX IF NOT EXISTS idx_ep_tracked_traders_rising_star
ON ep_tracked_traders(rising_star) WHERE rising_star = TRUE;

-- 8. Create GIN index on category_win_rates for JSON queries
CREATE INDEX IF NOT EXISTS idx_ep_tracked_traders_category_win_rates
ON ep_tracked_traders USING GIN (category_win_rates);

-- 9. Create GIN index on markets_specialized for array queries
CREATE INDEX IF NOT EXISTS idx_ep_tracked_traders_markets_specialized
ON ep_tracked_traders USING GIN (markets_specialized);

-- 10. Add comments for documentation
COMMENT ON COLUMN ep_tracked_traders.lifecycle_state IS 'Current activity state: hot (traded last 7d with +P&L), consistent (active 30d), cooling (30-60d inactive), cold (60+d inactive)';
COMMENT ON COLUMN ep_tracked_traders.rising_star IS 'Hidden gem flag: strong performance but not yet famous (high win rate, <100 trades, hot/consistent)';
COMMENT ON COLUMN ep_tracked_traders.category_win_rates IS 'Per-category win rates as JSON: {"crypto": 85.5, "politics": 60.0}';
COMMENT ON COLUMN ep_tracked_traders.markets_specialized IS 'Array of market IDs where trader has highest P&L (top 5)';
COMMENT ON COLUMN ep_tracked_traders.last_hot_streak_date IS 'Timestamp of most recent hot streak (traded last 7d with +P&L)';

-- Migration complete! 🚀
-- Next steps:
-- 1. Run trader_discovery_v2.py to populate new fields
-- 2. Update frontend to display lifecycle badges and rising stars
-- 3. Add filters for hot/rising star traders in the UI
