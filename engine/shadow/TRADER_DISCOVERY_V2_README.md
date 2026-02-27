# 🚀 Market-First Trader Discovery v2.0

## What Changed

**OLD (v1):** Pulled top 50 traders from global leaderboards → found same 147 traders every scan

**NEW (v2):** Scrapes individual markets → finds 500-1,000+ unique specialists

---

## Quick Start

### 1. Run Database Migration

```sql
-- In Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ljseawnwxbkrejwysrey/editor

\i /Users/erik/.openclaw/workspace/easypoly-clean/engine/db/migration_v2_trader_discovery.sql
```

### 2. Test the Discovery

```bash
cd /Users/erik/.openclaw/workspace/easypoly-clean/engine
python3 test_trader_discovery_v2.py
```

Expected: 100-500 traders discovered (test uses 50 markets × 10 traders)

### 3. Run Full Discovery

```python
from shadow.trader_discovery_v2 import TraderDiscovery
import asyncio

async def discover():
    discovery = TraderDiscovery(
        market_count=200,      # Top 200 markets
        traders_per_market=20  # Top 20 per market
    )
    await discovery.scan_all()

asyncio.run(discover())
```

Expected: 500-1,000+ traders discovered (200 markets × 20 traders)

---

## Key Features

### 1. Market-First Discovery (THE ALPHA)
- Fetch top 200 highest-volume markets
- Get top 20 traders by P&L per market
- Result: ~4,000 candidates → ~500-1,000 qualified
- Finds niche specialists: "90% win rate on NFL markets only"

### 2. Hard Filters
- ✅ Inactivity: >30 days → REJECT
- ✅ Bots: hex addresses, "updown" names, 99%+ win rate → REJECT
- ✅ Min track record: <15 trades OR <$500 volume → REJECT
- ✅ Data quality: incomplete API data → REJECT

### 3. Lifecycle States
- 🔥 **HOT:** Traded last 7d with +P&L (priority)
- ✅ **CONSISTENT:** Active 30d (reliable)
- ❄️ **COOLING:** No trades 30-60d (monitor)
- 🥶 **COLD:** Inactive 60+d (hide)

### 4. Category Specialists
- Track per-category win rates: `{"crypto": 85, "nfl": 92}`
- Identify primary category: "Best at: NFL markets"
- Store top 5 markets by P&L

### 5. Rising Star Detection
- High win rate (65%+) but <100 trades
- Currently hot/consistent
- 7d momentum >> 30d average
- Flag: `rising_star: true`

### 6. Existing 7-Factor Scoring (KEPT)
- ROI (20%) + Win Rate (20%) + Consistency (15%)
- Risk Mgmt (15%) + Volume (5%) + Edge (10%) + Recency (15%)
- Composite score → Tier (S/A/B/C/D)

---

## Database Schema (New Fields)

```sql
lifecycle_state TEXT          -- hot/consistent/cooling/cold
rising_star BOOLEAN           -- hidden gem flag
category_win_rates JSONB      -- {"crypto": 85.5, "politics": 60.0}
markets_specialized TEXT[]    -- ["0x1a2b3c...", "0x5e6f7g..."]
last_hot_streak_date TIMESTAMPTZ
```

---

## Files Created

1. **trader_discovery_v2.py** — New discovery engine
2. **migration_v2_trader_discovery.sql** — DB schema updates
3. **test_trader_discovery_v2.py** — Validation script
4. **TRADER_DISCOVERY_V2_DOCS.md** — Full documentation
5. **queries.py** (updated) — Added v2 fields to upsert

---

## Performance Targets

- **Speed:** 200 markets in <15 minutes
- **Discovery:** 500-1,000+ unique traders per scan
- **Quality:** 20%+ hot traders, 5%+ rising stars
- **Diversity:** 5+ categories represented

---

## Usage Examples

### Query Hot Traders
```sql
SELECT * FROM ep_tracked_traders
WHERE lifecycle_state = 'hot'
ORDER BY composite_rank DESC
LIMIT 20;
```

### Query Rising Stars
```sql
SELECT * FROM ep_tracked_traders
WHERE rising_star = TRUE
  AND lifecycle_state IN ('hot', 'consistent')
ORDER BY composite_rank DESC;
```

### Query NFL Specialists
```sql
SELECT * FROM ep_tracked_traders
WHERE category = 'nfl'
  AND (category_win_rates->>'nfl')::float > 70.0
ORDER BY composite_rank DESC;
```

---

## Next Steps

1. ✅ **Database Migration** — Run `migration_v2_trader_discovery.sql`
2. ✅ **Test Discovery** — Run `test_trader_discovery_v2.py`
3. 🔄 **Full Scan** — Update main engine to use v2
4. 🎨 **Frontend Updates:**
   - Add lifecycle badges (🔥 HOT, ✅ CONSISTENT)
   - Show rising stars (⭐)
   - Display category win rates
   - Filter by lifecycle/rising star
5. 📊 **Monitor Performance:**
   - Track discovery speed
   - Monitor DB growth
   - Check lifecycle distribution

---

## Comparison: v1 vs v2

| Metric | v1 | v2 |
|--------|----|----|
| Unique traders | 147 | 500-1,000+ |
| Discovery | Leaderboards | Markets |
| Category specialists | No | Yes |
| Lifecycle tracking | No | Yes |
| Rising stars | No | Yes |
| Bot filtering | Basic | Advanced |
| Competitive edge | Same 50 as everyone | Niche specialists |

---

**This is THE competitive edge. Built to win. 🚀**

Full docs: `TRADER_DISCOVERY_V2_DOCS.md`
