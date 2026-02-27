# 🚀 Trader Discovery v2.0 — Deployment Checklist

Use this to track your deployment progress. Check off each item as you complete it.

---

## Phase 1: Database Setup

### [ ] 1.1 Run Migration
- [ ] Open Supabase SQL Editor: https://supabase.com/dashboard/project/ljseawnwxbkrejwysrey/editor
- [ ] Copy contents of `engine/db/migration_v2_trader_discovery.sql`
- [ ] Paste into SQL Editor
- [ ] Execute migration
- [ ] Verify: Check that new columns exist in `ep_tracked_traders` table

**New columns added:**
- `lifecycle_state` (TEXT)
- `rising_star` (BOOLEAN)
- `category_win_rates` (JSONB)
- `markets_specialized` (TEXT[])
- `last_hot_streak_date` (TIMESTAMPTZ)

**Time estimate:** 2 minutes

---

## Phase 2: Testing

### [ ] 2.1 Test Discovery (Small Run)
```bash
cd /Users/erik/.openclaw/workspace/easypoly-clean/engine
python3 test_trader_discovery_v2.py
```

- [ ] Script runs without errors
- [ ] Discovers 100+ traders
- [ ] Hot traders detected (>0)
- [ ] Rising stars detected (>0)
- [ ] Category diversity (3+ categories)
- [ ] S-tier traders found (>0)
- [ ] Database upserts succeed

**Expected output:**
```
✅ Trader count: 347 >= 100 (PASS)
✅ Hot traders detected: 67 (PASS)
✅ Rising stars detected: 12 (PASS)
✅ Category diversity: 6 categories (PASS)
✅ S-tier traders found: 8 (PASS)
🎉 ALL TESTS PASSED!
```

**Time estimate:** 5-10 minutes

### [ ] 2.2 Verify Database Data
```sql
-- Check lifecycle distribution
SELECT lifecycle_state, COUNT(*) 
FROM ep_tracked_traders 
WHERE active = TRUE 
GROUP BY lifecycle_state;

-- Check rising stars
SELECT alias, lifecycle_state, composite_rank
FROM ep_tracked_traders 
WHERE rising_star = TRUE 
LIMIT 10;

-- Check category win rates
SELECT alias, category, category_win_rates
FROM ep_tracked_traders 
WHERE category_win_rates IS NOT NULL 
LIMIT 10;
```

- [ ] Lifecycle states populated
- [ ] Rising stars flagged
- [ ] Category win rates stored
- [ ] Markets specialized tracked

**Time estimate:** 2 minutes

---

## Phase 3: Production Deployment

### [ ] 3.1 Update Main Engine

**Option A: Replace v1 completely**
```bash
cd /Users/erik/.openclaw/workspace/easypoly-clean/engine/shadow
mv trader_discovery.py trader_discovery_v1_backup.py
mv trader_discovery_v2.py trader_discovery.py
```

**Option B: Keep both, import v2 in main engine**
```python
# In your main engine file
from shadow.trader_discovery_v2 import TraderDiscovery
```

- [ ] Decided on deployment strategy (A or B)
- [ ] Updated import statements
- [ ] Tested that engine runs without errors

**Time estimate:** 5 minutes

### [ ] 3.2 Run Full Discovery
```python
from shadow.trader_discovery_v2 import TraderDiscovery
import asyncio

async def discover():
    discovery = TraderDiscovery(
        market_count=200,      # Top 200 markets
        traders_per_market=20  # Top 20 per market
    )
    traders = await discovery.scan_all()
    return traders

asyncio.run(discover())
```

- [ ] Script runs without errors
- [ ] Discovers 500-1,000+ traders
- [ ] Lifecycle breakdown looks healthy
- [ ] Rising stars detected (5-10%)
- [ ] S-tier traders found (2-5%)
- [ ] All traders saved to database

**Expected output:**
```
🎯 Found 3,842 unique trader candidates from 200 markets
✅ 847 qualified traders (disqualified 2995)
✅ Discovery complete: 847 qualified + 43 whales, saved 890 to DB
   Lifecycle: hot: 156, consistent: 382, cooling: 189, cold: 77
   Rising stars: 34
```

**Time estimate:** 15-20 minutes

### [ ] 3.3 Verify Production Data
```sql
-- Total active traders
SELECT COUNT(*) FROM ep_tracked_traders WHERE active = TRUE;

-- Lifecycle breakdown
SELECT lifecycle_state, COUNT(*), 
       ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as pct
FROM ep_tracked_traders 
WHERE active = TRUE 
GROUP BY lifecycle_state;

-- Rising stars
SELECT COUNT(*) FROM ep_tracked_traders 
WHERE rising_star = TRUE AND active = TRUE;

-- Top 10 traders
SELECT alias, lifecycle_state, rising_star, composite_rank, 
       category, category_win_rates->>category as category_wr
FROM ep_tracked_traders 
WHERE active = TRUE 
ORDER BY composite_rank DESC 
LIMIT 10;
```

- [ ] 500+ active traders
- [ ] Lifecycle breakdown is reasonable (hot: 15-25%, consistent: 40-50%)
- [ ] Rising stars flagged (30-80 traders)
- [ ] Top traders have high composite_rank (0.7+)

**Time estimate:** 3 minutes

---

## Phase 4: Frontend Integration

### [ ] 4.1 Add Lifecycle Badges

```jsx
// In your trader card/list component
function LifecycleBadge({ state }) {
  const badges = {
    hot: { label: '🔥 HOT', variant: 'destructive' },
    consistent: { label: '✅ CONSISTENT', variant: 'success' },
    cooling: { label: '❄️ COOLING', variant: 'secondary' },
    cold: { label: '🥶 COLD', variant: 'outline' },
  };
  
  const badge = badges[state];
  return badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null;
}

// Usage
<LifecycleBadge state={trader.lifecycle_state} />
```

- [ ] Badge component created
- [ ] Lifecycle badges visible on trader cards
- [ ] Correct colors/variants applied
- [ ] Mobile responsive

**Time estimate:** 15 minutes

### [ ] 4.2 Add Rising Star Indicator

```jsx
// In your trader card component
{trader.rising_star && (
  <Badge variant="gold" className="ml-2">
    ⭐ RISING STAR
  </Badge>
)}
```

- [ ] Rising star badge visible
- [ ] Styled appropriately (gold/yellow)
- [ ] Only shows for rising_star=true

**Time estimate:** 5 minutes

### [ ] 4.3 Display Category Specialists

```jsx
// In your trader detail view
{trader.category && (
  <div className="flex items-center gap-2">
    <span className="font-semibold">Best at:</span>
    <span className="uppercase">{trader.category}</span>
    {trader.category_win_rates?.[trader.category] && (
      <Badge variant="outline">
        {trader.category_win_rates[trader.category]}% WR
      </Badge>
    )}
  </div>
)}

// Markets specialized
{trader.markets_specialized?.length > 0 && (
  <div>
    <span className="text-sm text-muted-foreground">
      Specializes in {trader.markets_specialized.length} markets
    </span>
  </div>
)}
```

- [ ] Primary category displayed
- [ ] Category win rate shown
- [ ] Markets specialized count visible
- [ ] Formatted nicely

**Time estimate:** 10 minutes

### [ ] 4.4 Add Filters

```jsx
// In your traders list page
<Select onValueChange={setLifecycleFilter}>
  <SelectTrigger>
    <SelectValue placeholder="Filter by lifecycle" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Traders</SelectItem>
    <SelectItem value="hot">🔥 Hot Only</SelectItem>
    <SelectItem value="consistent">✅ Consistent Only</SelectItem>
    <SelectItem value="cooling">❄️ Cooling</SelectItem>
  </SelectContent>
</Select>

<Checkbox 
  id="rising-stars"
  checked={showRisingStarsOnly}
  onCheckedChange={setShowRisingStarsOnly}
>
  ⭐ Rising Stars Only
</Checkbox>

// Filter logic
const filteredTraders = traders.filter(t => {
  if (lifecycleFilter !== 'all' && t.lifecycle_state !== lifecycleFilter) return false;
  if (showRisingStarsOnly && !t.rising_star) return false;
  return true;
});
```

- [ ] Lifecycle filter dropdown added
- [ ] Rising stars checkbox added
- [ ] Filters work correctly
- [ ] Filter state persists
- [ ] UI updates when filters change

**Time estimate:** 20 minutes

### [ ] 4.5 Update Trader List Query

```typescript
// Update your API call to sort by lifecycle priority
const { data: traders } = await supabase
  .from('ep_tracked_traders')
  .select('*')
  .eq('active', true)
  .order('lifecycle_state', { ascending: false })  // Hot first
  .order('composite_rank', { ascending: false });

// Or use a custom sort in JavaScript
traders.sort((a, b) => {
  const lifecyclePriority = { hot: 4, consistent: 3, cooling: 2, cold: 1, unknown: 0 };
  const priorityDiff = lifecyclePriority[b.lifecycle_state] - lifecyclePriority[a.lifecycle_state];
  if (priorityDiff !== 0) return priorityDiff;
  return b.composite_rank - a.composite_rank;
});
```

- [ ] Query updated to fetch lifecycle data
- [ ] Traders sorted by lifecycle priority
- [ ] Hot traders appear first
- [ ] Cold traders hidden or at bottom

**Time estimate:** 10 minutes

---

## Phase 5: Monitoring & Optimization

### [ ] 5.1 Set Up Monitoring Dashboard

Create a monitoring query (save as view or run periodically):

```sql
CREATE OR REPLACE VIEW trader_discovery_stats AS
SELECT 
  COUNT(*) as total_active,
  SUM(CASE WHEN lifecycle_state = 'hot' THEN 1 ELSE 0 END) as hot_count,
  SUM(CASE WHEN lifecycle_state = 'consistent' THEN 1 ELSE 0 END) as consistent_count,
  SUM(CASE WHEN lifecycle_state = 'cooling' THEN 1 ELSE 0 END) as cooling_count,
  SUM(CASE WHEN lifecycle_state = 'cold' THEN 1 ELSE 0 END) as cold_count,
  SUM(CASE WHEN rising_star = TRUE THEN 1 ELSE 0 END) as rising_stars,
  COUNT(DISTINCT category) as unique_categories,
  ROUND(AVG(composite_rank), 3) as avg_score
FROM ep_tracked_traders 
WHERE active = TRUE;
```

- [ ] View created or query saved
- [ ] Accessible from dashboard/admin panel
- [ ] Updated after each discovery run

**Time estimate:** 10 minutes

### [ ] 5.2 Schedule Regular Discovery Runs

**Option A: Cron job**
```bash
# Add to crontab
0 */6 * * * cd /path/to/easypoly-clean/engine && python3 -c "from shadow.trader_discovery_v2 import TraderDiscovery; import asyncio; asyncio.run(TraderDiscovery().scan_all())"
```

**Option B: Background worker**
```python
# In your worker service
schedule.every(6).hours.do(run_trader_discovery_v2)
```

- [ ] Decided on scheduling method (A or B)
- [ ] Schedule configured (every 6-12 hours recommended)
- [ ] Tested that scheduled runs work
- [ ] Logs are captured

**Time estimate:** 15 minutes

### [ ] 5.3 Performance Tuning

If discovery is too slow, adjust these settings in `trader_discovery_v2.py`:

```python
# Current settings
MAX_CONCURRENT = 10      # Parallel requests
REQUEST_DELAY = 0.3      # Seconds between requests
market_count = 200       # Markets to scan
traders_per_market = 20  # Traders per market

# If too slow:
MAX_CONCURRENT = 15      # More parallelism
REQUEST_DELAY = 0.2      # Faster requests

# If hitting rate limits:
MAX_CONCURRENT = 5       # Less parallelism
REQUEST_DELAY = 0.5      # Slower requests
```

- [ ] Initial run performance measured (should be <20 min for 200 markets)
- [ ] Adjusted if needed
- [ ] No rate limit errors
- [ ] Discovery completes successfully

**Time estimate:** 10 minutes (if tuning needed)

---

## Phase 6: Documentation & Handoff

### [ ] 6.1 Update Team Documentation

Add to your team wiki/docs:

- [ ] Link to `TRADER_DISCOVERY_V2_DOCS.md`
- [ ] Link to `TRADER_DISCOVERY_V2_README.md`
- [ ] Explain new trader fields (lifecycle, rising_star, category_win_rates)
- [ ] Document query examples for filtering
- [ ] Add troubleshooting guide

**Time estimate:** 15 minutes

### [ ] 6.2 Update API/Frontend Docs

If you have API docs:

- [ ] Document new trader fields in response schemas
- [ ] Add examples of lifecycle filtering
- [ ] Document rising star flag usage
- [ ] Update Swagger/OpenAPI specs

**Time estimate:** 10 minutes

### [ ] 6.3 Communicate Changes

- [ ] Notify team of new discovery system
- [ ] Explain benefits (10x more traders, specialists, etc.)
- [ ] Share how to use new filters/badges
- [ ] Set expectations for data quality improvements

**Time estimate:** 5 minutes

---

## ✅ Final Checklist

### All Systems Go?

- [ ] Database migration applied ✅
- [ ] Test run passed ✅
- [ ] Production discovery run completed ✅
- [ ] Frontend shows lifecycle badges ✅
- [ ] Frontend shows rising stars ✅
- [ ] Filters work correctly ✅
- [ ] Monitoring dashboard set up ✅
- [ ] Scheduled runs configured ✅
- [ ] Documentation updated ✅
- [ ] Team notified ✅

### Success Metrics

After deployment, you should see:

- **Trader Count:** 500-1,000+ active traders (up from ~147)
- **Lifecycle Distribution:**
  - Hot: 15-25% (actively making money)
  - Consistent: 40-50% (reliable performers)
  - Cooling: 20-30% (going quiet)
  - Cold: <10% (hide from UI)
- **Rising Stars:** 5-10% of active traders
- **Category Diversity:** 5-7+ distinct categories
- **S-Tier Traders:** 2-5% (elite performers)

### If Something Goes Wrong

**Discovery finds <100 traders:**
- Check API endpoints (market trader rankings may need adjustment)
- Verify network connectivity to Polymarket API
- Check rate limits (reduce MAX_CONCURRENT)

**Database errors:**
- Verify migration was applied (check for new columns)
- Check queries.py has v2 field mappings
- Review Supabase logs for errors

**Frontend not showing new data:**
- Clear browser cache
- Verify API returns new fields
- Check component props/mappings

**Need help?**
- Check `TRADER_DISCOVERY_V2_DOCS.md` for technical details
- Review audit logs in `ep_audit_log` table
- Check discovery script logs for error messages

---

## 🎉 Deployment Complete!

When all checkboxes are ticked, you've successfully deployed Market-First Trader Discovery v2.0.

**You now have THE competitive edge: 500-1,000+ niche specialists that no one else tracks.** 🚀

Built by Miyamoto, 2026-02-25 🤖
