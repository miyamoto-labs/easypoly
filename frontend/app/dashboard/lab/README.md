# Strategy Lab 🧪

Backtest trading strategies against historical Synthdata predictions with social sharing and public leaderboard.

---

## Features

### 🤖 Strategy Backtesting
- **Pre-built strategies:** Edge-based, Momentum, Contrarian, Arbitrage
- **Custom parameters:** Edge threshold, confidence, position size, timeframe
- **Detailed metrics:** Return, win rate, Sharpe ratio, max drawdown, profit factor
- **Visual analysis:** Equity curve charts, trade history table
- **Performance analytics:** Winning/losing trades, avg win/loss, largest win/loss

### 🌐 Social Sharing
- **Twitter/X integration:** One-click share with screenshot
- **Unique share URLs:** Each backtest gets a permanent link
- **Viral potential:** Beautiful result cards designed for social media
- **Easy discovery:** Share URL format: `easypoly.lol/lab?s={hash}`

### 🏆 Public Leaderboard
- **Top strategies:** See the best-performing backtests
- **Multiple sorts:** Return %, Win Rate, Most Shared
- **Try it yourself:** One-click to load any strategy
- **Community driven:** Learn from other traders

### 📊 Data Export
- **CSV export:** Download full trade history
- **All details:** Timestamp, asset, direction, prices, profit, edge, confidence
- **Analysis ready:** Import into Excel, Google Sheets, Python, R

### 📱 Mobile Optimized
- **Responsive design:** Works on phone, tablet, desktop
- **Touch-friendly:** Large buttons, easy navigation
- **Card-based mobile view:** Trade history as cards on small screens
- **No horizontal scroll:** Clean UX on all devices

---

## Usage

### Running a Backtest

1. **Select Strategy:**
   - Choose from dropdown: Edge-Based, Momentum, Contrarian, Arbitrage
   - Or build custom with specific parameters

2. **Configure Parameters:**
   - **Edge Threshold:** Minimum edge to enter trade (0-100%)
   - **Confidence:** Minimum prediction confidence (0-100%)
   - **Position Size:** Amount to risk per trade ($)
   - **Timeframe:** 1min, 5min, 15min, 1hour, 4hour, 1day
   - **Asset:** BTC or ETH
   - **Days Back:** Historical period (7-90 days)

3. **Run Backtest:**
   - Click "Run Backtest" button
   - Wait for progress bar (usually 2-5 seconds)
   - View results!

### Sharing Results

1. **Twitter/X Share:**
   - Click "Share on 𝕏" button
   - Screenshot auto-downloads
   - Twitter window opens with pre-filled text
   - Attach downloaded image and post

2. **Get Share Link:**
   - Click "Get Share Link"
   - URL auto-copies to clipboard
   - Share anywhere: Discord, Telegram, email
   - Anyone can load your exact strategy

3. **View Leaderboard:**
   - Click "🏆 Leaderboard" in header
   - See top-performing strategies
   - Sort by different metrics
   - Click "Try It" to load any strategy

### Exporting Data

- Click "Export CSV" button
- File downloads: `backtest-{strategy}-{date}.csv`
- Import into your favorite tools

---

## API Endpoints

### POST `/api/backtest`
Run a backtest with given parameters.

**Body:**
```json
{
  "strategy_name": "edge_based",
  "custom_params": {
    "edge_threshold": 0.05,
    "confidence_threshold": 0.7,
    "position_size": 100,
    "timeframe": "5min"
  },
  "days_back": 30,
  "asset": "BTC"
}
```

**Response:**
```json
{
  "strategy": { "name": "...", "edge_threshold": 0.05, ... },
  "metrics": { "total_return": 150, "win_rate": 65, ... },
  "trades": [...],
  "equity_curve": [...]
}
```

### POST `/api/lab/share`
Save a backtest for sharing.

**Body:**
```json
{
  "strategy_name": "edge_based",
  "params": { "edge_threshold": 0.05, ... },
  "results": { "total_return_pct": 15.5, ... }
}
```

**Response:**
```json
{
  "hash": "abc123def456",
  "data": { "id": "...", "created_at": "..." }
}
```

### GET `/api/lab/share?hash={hash}`
Retrieve a shared backtest.

**Response:**
```json
{
  "hash": "abc123def456",
  "strategy_name": "edge_based",
  "params": { "edge_threshold": 0.05, ... },
  "results": { "total_return_pct": 15.5, ... },
  "shares_count": 42
}
```

---

## Database Schema

### Table: `lab_backtests`

```sql
CREATE TABLE lab_backtests (
  id UUID PRIMARY KEY,
  hash TEXT UNIQUE NOT NULL,
  strategy_name TEXT NOT NULL,
  params JSONB NOT NULL,
  results JSONB NOT NULL,
  shares_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
);
```

**Indexes:**
- `idx_lab_backtests_hash` - Fast hash lookups
- `idx_lab_backtests_return` - Sort by return %
- `idx_lab_backtests_winrate` - Sort by win rate
- `idx_lab_backtests_shares` - Sort by popularity

---

## Components

### `page.tsx`
Main Strategy Lab page. Orchestrates all components.

**Features:**
- Strategy builder integration
- Backtest execution
- Results display
- Share URL loading
- Loading states
- Error handling

### `ResultsActions.tsx`
Social sharing and export actions.

**Features:**
- Twitter/X share with screenshot
- Share URL generation
- CSV export
- Clipboard copy

### `StrategyBuilder.tsx`
Strategy configuration form.

**Features:**
- Pre-built strategy selection
- Custom parameter inputs
- Validation
- Submit handling

### `MetricsCards.tsx`
Performance metrics display.

**Features:**
- Animated numbers
- Color-coded results (green/yellow/red)
- Primary + detailed metrics
- Grid layout

### `ResultsChart.tsx`
Equity curve visualization.

**Features:**
- Line chart (using Recharts)
- Responsive
- Tooltips
- Clean styling

### `TradesTable.tsx`
Trade history table/cards.

**Features:**
- Desktop: Table view
- Mobile: Card view
- Pagination (show 10, expand to all)
- Color-coded wins/losses

### `SkeletonLoader.tsx`
Loading placeholders (ready to use).

**Features:**
- Metrics skeleton
- Chart skeleton
- Table skeleton
- Pulse animation

---

## Deployment

### Requirements
- Next.js 14+
- React 18+
- Supabase (for shared strategies)
- Node.js 18+

### Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key  # optional, for server-side
```

### Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run database migration:**
   ```bash
   supabase db push
   # or run SQL manually in Supabase Studio
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

---

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile Safari (iOS 13+)
- ✅ Chrome Mobile (Android)

---

## Performance

- **Page Load:** <2 seconds
- **Backtest Execution:** 2-5 seconds (depending on data)
- **Screenshot Generation:** ~1 second
- **CSV Export:** Instant

---

## Troubleshooting

### "Failed to run backtest"
- Check backend API is running
- Verify Synthdata endpoints are accessible
- Check browser console for errors

### "Shared strategy not found"
- Verify Supabase migration ran
- Check database connection
- Ensure hash is valid

### Twitter share not working
- Check browser allows popup windows
- Verify Twitter intent URL format
- Try manually: open twitter.com and compose

### CSV export not downloading
- Check browser download settings
- Verify file-saver is installed
- Try different browser

---

## Contributing

### Adding a New Strategy

1. Add strategy definition to backend
2. Update dropdown in `StrategyBuilder.tsx`
3. Add default parameters
4. Test backtest execution

### Improving Mobile UX

1. Test on real devices
2. Check touch target sizes (minimum 48px)
3. Verify no horizontal scroll
4. Test with long text/numbers

---

## Credits

**Built by:** MIYAMOTO LABS 🚀
**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Recharts, Supabase
**Libraries:** html2canvas, file-saver

---

## License

Proprietary - EasyPoly.io
