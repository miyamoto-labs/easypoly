-- Create lab_backtests table for Strategy Lab shared strategies
CREATE TABLE IF NOT EXISTS lab_backtests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hash TEXT UNIQUE NOT NULL,
  strategy_name TEXT NOT NULL,
  params JSONB NOT NULL,
  results JSONB NOT NULL,
  shares_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on hash for fast lookups
CREATE INDEX IF NOT EXISTS idx_lab_backtests_hash ON lab_backtests(hash);

-- Create index on created_at for leaderboard sorting
CREATE INDEX IF NOT EXISTS idx_lab_backtests_created_at ON lab_backtests(created_at DESC);

-- Create index on results->total_return_pct for return leaderboard
CREATE INDEX IF NOT EXISTS idx_lab_backtests_return ON lab_backtests((results->>'total_return_pct')::numeric DESC);

-- Create index on results->win_rate for win rate leaderboard
CREATE INDEX IF NOT EXISTS idx_lab_backtests_winrate ON lab_backtests((results->>'win_rate')::numeric DESC);

-- Create index on shares_count for most shared leaderboard
CREATE INDEX IF NOT EXISTS idx_lab_backtests_shares ON lab_backtests(shares_count DESC);

-- Add RLS (Row Level Security) policies
ALTER TABLE lab_backtests ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access"
  ON lab_backtests
  FOR SELECT
  USING (true);

-- Allow authenticated insert
CREATE POLICY "Allow authenticated insert"
  ON lab_backtests
  FOR INSERT
  WITH CHECK (true);

-- Allow update of shares_count
CREATE POLICY "Allow update shares_count"
  ON lab_backtests
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_lab_backtests_updated_at
  BEFORE UPDATE ON lab_backtests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
