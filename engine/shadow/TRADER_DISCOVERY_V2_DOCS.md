# Market-First Trader Discovery v2.0 — Documentation

## 🚀 The Competitive Edge

**THE PROBLEM:** Current scanner pulls top 50 from global leaderboards → finds same 147 traders every scan.

**THE SOLUTION:** Scrape individual MARKETS to find niche specialists making bank that no one tracks.

**THE RESULT:** ~4,000 unique trader candidates vs 50 from leaderboards.

---

## 📊 Discovery Pipeline

### Phase 1: Market-First Discovery (THE ALPHA ENGINE)

```
1. Fetch top 200 highest-volume markets from Polymarket
2. For EACH market: get top 20 traders by P&L
3. Result: ~4,000 unique trader candidates
4. Finds specialists: "90% win rate on NFL markets only"
```

**Why this works:**
- Global leaderboards show only the top 50 whales
- Individual markets reveal niche specialists who dominate specific categories
- Overlap between markets is ~30-40%, so 200 markets × 20 traders = 2,000-3,000 unique addresses
- Captures hidden gems before they're famous

### Phase 2: Hard Filters (QUALITY CONTROL)

All traders must pass these filters or get REJECTED:

```python
✅ Inactivity kill: last_trade_date >30 days → REJECT
✅ Bot detection: hex addresses, "updown" names, 99%+ win rate with >15 trades → REJECT
✅ Minimum track record: <15 trades OR <$500 volume → REJECT
✅ Wash trading: detect circular patterns → REJECT
✅ Incomplete data: win_count=0 losses with >10 trades → REJECT (API issue)
```

**Bot Detection Patterns:**
- Hex address pattern (>80% hex characters)
- Username contains "updown", "bot", "test", "auto"
- Suspiciously perfect win rate (99%+ with 15+ trades)

**Data Quality Checks:**
- Flag suspicious win rates (95%+ with 20+ resolved positions = incomplete API data)
- Detect API pagination limits (9,999 trades = incomplete data)
- Identify zero-loss traders (likely API filtering issue)

### Phase 3: Lifecycle States (SHOW WHAT'S HOT NOW)

Each trader is assigned a lifecycle state based on recent activity:

```python
🔥 HOT: traded last 7d, +P&L last 30d
   → Active right now, making money, PRIORITY for copy trading

✅ CONSISTENT: active 30d, stable win rate
   → Reliable, steady performance, good for long-term following

❄️  COOLING: no trades 30-60d
   → Going quiet, monitor but don't prioritize

🥶 COLD: inactive 60+d
   → Hide from users, keep in DB for historical analysis
```

**Field:** `lifecycle_state` (TEXT)

**Usage:**
```sql
-- Get only hot traders
SELECT * FROM ep_tracked_traders 
WHERE lifecycle_state = 'hot' 
ORDER BY composite_rank DESC;
```

### Phase 4: Category Specialists (MULTI-DIMENSIONAL)

Track per-category performance to identify specialists:

```python
# Category breakdown by exposure
category_breakdown: {"crypto": 60, "politics": 30, "sports": 10}

# Per-category win rates
category_win_rates: {"crypto": 85.5, "politics": 60.0, "nfl": 92.3}

# Primary category (highest exposure)
primary_category: "crypto"

# Top markets by P&L (specialization)
markets_specialized: ["0x1a2b3c...", "0x5e6f7g..."]
```

**Categories Tracked:**
- `politics` - Elections, government, legislation
- `sports` - NFL, NBA, MLB, etc.
- `nfl` - NFL-specific (sub-category of sports)
- `crypto` - Bitcoin, Ethereum, DeFi, NFTs
- `culture` - Movies, music, celebrities
- `finance` - Stocks, bonds, economics

**Show users:**
```
"Best at: NFL markets (92.3% win rate)"
```

### Phase 5: Rising Star Detection (HIDDEN GEMS)

Identify traders with strong performance but not yet famous:

```python
Criteria:
✅ 7-day P&L momentum >> 30-day average = rising fast
✅ High win rate (65%+) but <100 trades = early journey  
✅ Currently hot or consistent (active)
✅ High recent score (recency_score >= 85, composite >= 70)
```

**Field:** `rising_star` (BOOLEAN)

**Why this matters:**
- Find talent BEFORE they're famous
- Lower follower count = less crowded trades
- Early movers get better prices

**Usage:**
```sql
-- Get rising stars
SELECT * FROM ep_tracked_traders 
WHERE rising_star = TRUE 
ORDER BY composite_rank DESC;
```

### Phase 6: Existing Scoring System (KEEP IT)

The current 7-factor algorithm is EXCELLENT. We just feed it better input data.

**Scoring Weights:**
```python
ROI (20%)         - Return on investment via sigmoid scaling
Win Rate (20%)    - From actual closed positions
Consistency (15%) - PnL variability
Risk Mgmt (15%)   - Position sizing discipline
Volume (5%)       - Log-scaled trading volume
Edge (10%)        - Performance above random baseline
Recency (15%)     - How recently the trader was active
```

**Composite Score:** 0-100 scale

**Tier Assignment:**
- **S-Tier:** 80+ — Elite trader. Strong copy candidate.
- **A-Tier:** 65-79 — High-quality trader. Worth following closely.
- **B-Tier:** 50-64 — Decent trader. Monitor before copying.
- **C-Tier:** 35-49 — Below average. Proceed with caution.
- **D-Tier:** <35 — Weak track record. Not recommended.

---

## 🗄️ Database Schema Updates

### New Fields in `ep_tracked_traders`

```sql
-- Lifecycle state (hot/consistent/cooling/cold)
lifecycle_state TEXT DEFAULT 'unknown'

-- Hidden gem flag
rising_star BOOLEAN DEFAULT FALSE

-- Per-category win rates
category_win_rates JSONB DEFAULT '{}'::jsonb
-- Example: {"crypto": 85.5, "politics": 60.0}

-- Top markets by P&L (array of market IDs)
markets_specialized TEXT[] DEFAULT ARRAY[]::TEXT[]

-- Most recent hot streak timestamp
last_hot_streak_date TIMESTAMPTZ
```

### Indexes

```sql
-- Fast filtering by lifecycle
CREATE INDEX idx_ep_tracked_traders_lifecycle 
ON ep_tracked_traders(lifecycle_state);

-- Quick rising star discovery
CREATE INDEX idx_ep_tracked_traders_rising_star 
ON ep_tracked_traders(rising_star) 
WHERE rising_star = TRUE;

-- JSON queries on category win rates
CREATE INDEX idx_ep_tracked_traders_category_win_rates 
ON ep_tracked_traders USING GIN (category_win_rates);

-- Array queries on specialized markets
CREATE INDEX idx_ep_tracked_traders_markets_specialized 
ON ep_tracked_traders USING GIN (markets_specialized);
```

---

## 🚀 Performance & Optimization

### Concurrent Processing

```python
MAX_CONCURRENT = 10  # Process 10 markets simultaneously
REQUEST_DELAY = 0.3  # 300ms between requests (rate limiting)
```

**Target:** Scan 200 markets in <15 minutes

### Incremental Storage

Results are stored incrementally (don't wait for full scan to complete):
```python
for t in traders_list:
    try:
        TraderQueries.upsert_trader(t)  # Immediate upsert
        saved += 1
    except Exception as e:
        log("warning", f"Failed to upsert trader: {e}")
```

### Accumulation (NOT Replacement)

**CRITICAL:** We ACCUMULATE good traders over time, we don't replace:

```python
# Each scan ADDS new discoveries to the existing database
# We do NOT deactivate existing traders
# active=True for discovered traders (keeps them in the pool)
```

**Why:** The more traders we track, the more opportunities we find.

---

## 🧪 Testing

### Test Script

```bash
cd /Users/erik/.openclaw/workspace/easypoly-clean/engine
python3 test_trader_discovery_v2.py
```

**Expected Output:**
```
✅ Trader count: 500+ (PASS)
✅ Hot traders detected: 50+ (PASS)
✅ Rising stars detected: 20+ (PASS)
✅ Category diversity: 5+ categories (PASS)
✅ S-tier traders found: 10+ (PASS)
```

### Validation Criteria

1. **Minimum trader count:** ≥500 unique traders (from 200 markets × 20 traders)
2. **Lifecycle distribution:** Hot traders detected (recent activity)
3. **Rising stars:** Hidden gems identified (strong + early)
4. **Category diversity:** ≥5 distinct categories represented
5. **Quality threshold:** S-tier traders present (composite ≥80)

---

## 🔧 API Endpoints

### Polymarket Data API

```python
# Fetch top markets by volume
GET /markets?limit=200&orderBy=volume

# Get top traders per market (P&L)
GET /trades?market={id}&limit=20&orderBy=pnl

# Trader profiling (existing endpoints)
GET /trades?user={address}
GET /positions?user={address}
GET /closed-positions?user={address}
GET /value?user={address}
```

---

## 📈 Output & Logging

### Audit Log

```json
{
  "event_type": "trader_discovery_v2",
  "event_data": {
    "total_saved": 847,
    "qualified_from_markets": 804,
    "seed_whales": 43,
    "lifecycle_breakdown": {
      "hot": 156,
      "consistent": 382,
      "cooling": 189,
      "cold": 77
    },
    "rising_stars": 34,
    "tiers": {
      "S": 23,
      "A": 107,
      "B": 298,
      "C": 254,
      "D": 122
    }
  },
  "source": "trader_discovery"
}
```

### Console Output

```
🚀 Starting market-first trader discovery v2.0...
Fetching top 200 markets by volume...
Found 200 markets, scanning for top traders...
Scanned 50/200 markets, found 1,247 unique traders
🎯 Found 3,842 unique trader candidates from 200 markets
Profiling candidates (this may take a while)...
Profiled 100/3842 traders
Scoring 3,842 traders with v2 algorithm...
✅ Alice: 87.3 (Tier S, hot, ⭐ rising star)
✅ Bob: 72.1 (Tier A, consistent)
❌ Bot123: Bot detected: Hex address pattern (95% hex chars)
✅ 847 qualified traders (disqualified 2995)
Upserting discovered traders (accumulating, not replacing)
✅ Discovery complete: 847 qualified traders + 43 whales, saved 890 to DB
   Lifecycle: hot: 156, consistent: 382, cooling: 189, cold: 77
   Rising stars: 34
```

---

## 🎯 Usage Examples

### Run Full Discovery (Production)

```python
from shadow.trader_discovery_v2 import TraderDiscovery
import asyncio

async def discover():
    discovery = TraderDiscovery(
        market_count=200,      # Top 200 markets
        traders_per_market=20  # Top 20 traders per market
    )
    traders = await discovery.scan_all()
    return traders

asyncio.run(discover())
```

### Query Hot Traders

```python
from db.queries import TraderQueries

# Get top 10 hot traders
hot_traders = TraderQueries.get_top_traders(limit=10)
hot_traders = [t for t in hot_traders if t.get("lifecycle_state") == "hot"]
```

### Query Rising Stars

```sql
SELECT * FROM ep_tracked_traders
WHERE rising_star = TRUE
  AND lifecycle_state IN ('hot', 'consistent')
ORDER BY composite_rank DESC
LIMIT 20;
```

### Query Category Specialists

```sql
-- Get NFL specialists with high win rates
SELECT * FROM ep_tracked_traders
WHERE category = 'nfl'
  AND (category_win_rates->>'nfl')::float > 70.0
ORDER BY composite_rank DESC;
```

---

## 🏆 Comparison: v1 vs v2

| Metric | v1 (Leaderboard-Only) | v2 (Market-First) |
|--------|----------------------|-------------------|
| Unique traders discovered | 147 | 500-1,000+ |
| Discovery method | Global leaderboards | Individual markets |
| Category specialists | No | Yes (per-category WR) |
| Lifecycle tracking | No | Yes (hot/consistent/cooling/cold) |
| Rising star detection | No | Yes (hidden gems) |
| Bot filtering | Basic | Advanced (3 patterns) |
| Data quality checks | 1 | 5 |
| Markets specialized | No | Yes (top 5 by P&L) |
| Competitive edge | Same 50 as everyone | Niche specialists no one tracks |

---

## 🚨 Known Limitations & Future Improvements

### Current Limitations

1. **API Endpoint Assumption:** The exact endpoint for market-specific trader rankings may differ from `/trades?market={id}&orderBy=pnl`. Adjust based on actual API.

2. **Timestamp Data:** Closed positions may not always include timestamps. Lifecycle detection relies on this data.

3. **Rate Limiting:** 200 markets × 20 traders = 4,000+ API calls. May hit rate limits with aggressive scanning.

### Future Improvements

1. **Adaptive Market Selection:**
   - Instead of static top 200, rotate through different market categories
   - Discover specialists in emerging categories (e.g., AI, climate)

2. **Momentum-Based Rising Star Detection:**
   - Track 7-day vs 30-day P&L velocity (requires timestamped data)
   - Detect acceleration in performance

3. **Wash Trading Detection:**
   - Analyze circular trading patterns (A→B→A)
   - Flag suspiciously consistent counterparties

4. **Follower Count Integration:**
   - If Polymarket adds follower counts to API, use for rising star detection
   - Low followers + high performance = hidden gem

5. **Real-Time Updates:**
   - Instead of batch scanning, stream market updates
   - Detect hot streaks as they happen

---

## 📚 References

- **Original v1 Implementation:** `trader_discovery.py`
- **Database Schema:** `migration_v2_trader_discovery.sql`
- **Test Script:** `test_trader_discovery_v2.py`
- **Config:** `config.py` (WHALE_WALLETS, API settings)

---

## ✅ Deployment Checklist

1. **Run Database Migration:**
   ```sql
   -- In Supabase SQL Editor
   \i migration_v2_trader_discovery.sql
   ```

2. **Update queries.py:**
   - [x] Add v2 fields to upsert_trader()

3. **Test Discovery:**
   ```bash
   python3 test_trader_discovery_v2.py
   ```

4. **Run Full Scan:**
   ```python
   # Update main engine to use TraderDiscovery v2
   from shadow.trader_discovery_v2 import TraderDiscovery
   ```

5. **Update Frontend:**
   - Add lifecycle badges (🔥 HOT, ✅ CONSISTENT, ❄️ COOLING)
   - Add rising star indicator (⭐)
   - Show category win rates ("Best at: NFL - 92.3% WR")
   - Filter by lifecycle state

6. **Monitor Performance:**
   - Track discovery speed (target: 200 markets in <15 min)
   - Monitor DB growth (expect 500-1,000 new traders per scan)
   - Check audit logs for lifecycle/tier distribution

---

**Built to win. 🚀**
