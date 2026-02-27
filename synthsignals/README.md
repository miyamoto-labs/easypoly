# 🚨 SynthSignals - Real-Time Polymarket Alert System

> AI-powered edge detection for Polymarket using Synthdata predictions

SynthSignals monitors Synthdata AI predictions every 5 minutes and alerts you when high-edge opportunities appear on Polymarket. Never miss a mispriced market again.

## 🎯 How It Works

1. **Poll Synthdata** - Every 5 minutes, fetch predictions for BTC, ETH, SOL
2. **Calculate Edge** - Compare Synthdata probability vs Polymarket probability
3. **Alert on Opportunity** - When edge > threshold (default 15%), send Telegram alert
4. **Rate Limited** - Max 1 alert per hour per asset (no spam!)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Supabase account
- Synthdata API key (optional for testing - uses mock data without it)

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env
```

### Configuration

Edit `.env`:

```env
# Synthdata API (leave empty to use mock data for testing)
SYNTHDATA_API_KEY=your_key_here

# Telegram Bot (required)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Supabase (required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_key_here

# Alert Settings
EDGE_THRESHOLD=15
POLL_INTERVAL_MS=300000
MAX_ALERTS_PER_HOUR_PER_ASSET=1
```

### Database Setup

1. Create a Supabase project at https://supabase.com
2. Run this SQL in the SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS synth_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  asset TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('UP', 'DOWN')),
  synth_prob NUMERIC NOT NULL,
  poly_prob NUMERIC NOT NULL,
  edge NUMERIC NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH')),
  polymarket_url TEXT,
  alerted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_synth_signals_timestamp ON synth_signals(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_synth_signals_asset ON synth_signals(asset);
CREATE INDEX IF NOT EXISTS idx_synth_signals_alerted ON synth_signals(alerted);
```

### Create Your Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot`
3. Choose a name (e.g., "SynthSignals Bot")
4. Choose a username (e.g., "synthsignals_bot")
5. Copy the bot token to your `.env` file

### Testing

```bash
# Test Synthdata integration (uses mock data)
npm test

# Expected output:
# ✅ Fetched 6 signals (BTC, ETH, SOL x2 each)
# ✅ Generated 2 alerts (signals with edge > 15%)
```

### Running

```bash
# Start the bot
npm start

# Expected output:
# ✅ Configuration validated
# ✅ Supabase client initialized
# ✅ Telegram bot initialized
# ⏰ Monitoring started (polling every 5 minutes)
```

## 📱 Telegram Commands

- `/start` - Subscribe to alerts
- `/stop` - Unsubscribe from alerts
- `/settings` - Configure your preferences (edge threshold, assets)
- `/status` - Check system status
- `/history` - View recent signals
- `/help` - Show help message

## 📊 Web Dashboard

Access the dashboard at:
```
http://localhost:3000/dashboard/signals
```

Features:
- Real-time signals feed (last 24 hours)
- Asset filtering (BTC, ETH, SOL, All)
- Alert history
- Live status indicator
- Subscribe button (Telegram deep link)

## 🎨 Alert Format

```
🚨 HIGH EDGE DETECTED

Asset: BTC
Direction: UP ⬆️
Edge: +18.5%

Synthdata: 65.2% UP
Polymarket: 46.7% UP

Confidence: 🔥🔥🔥 (HIGH)
Timeframe: Next hour

🔗 Trade on Polymarket: [link]
⏰ Detected: 2:34 PM
```

## 🏗️ Architecture

```
synthsignals/
├── src/
│   ├── index.js           # Main entry point
│   ├── config.js          # Configuration management
│   ├── database.js        # Supabase client & queries
│   ├── monitor.js         # Synthdata API polling
│   ├── alerts.js          # Alert engine & formatting
│   ├── telegram-bot.js    # Telegram bot interface
│   └── test-synthdata.js  # Test suite
├── package.json
├── .env.example
└── README.md
```

## 🚀 Deployment (Railway)

### One-Click Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/synthsignals)

### Manual Deploy

1. Install Railway CLI:
```bash
npm i -g @railway/cli
```

2. Login to Railway:
```bash
railway login
```

3. Create new project:
```bash
railway init
```

4. Add environment variables:
```bash
railway variables set TELEGRAM_BOT_TOKEN=your_token_here
railway variables set SUPABASE_URL=your_url_here
railway variables set SUPABASE_SERVICE_KEY=your_key_here
railway variables set SYNTHDATA_API_KEY=your_api_key_here
```

5. Deploy:
```bash
railway up
```

6. Check logs:
```bash
railway logs
```

## 📈 Roadmap

- [x] Telegram bot with alerts
- [x] Web dashboard
- [x] Supabase integration
- [x] Rate limiting
- [ ] Discord bot
- [ ] Per-user settings (edge threshold, assets)
- [ ] More assets (equities, commodities)
- [ ] Historical performance tracking
- [ ] Trade execution integration
- [ ] Mobile app

## 🤝 Contributing

Contributions welcome! This is an open-source hackathon project.

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR

## 📄 License

MIT License - see LICENSE file

## 🙏 Credits

- Built by [MIYAMOTO LABS](https://twitter.com/miyamotolabs)
- Powered by [Synthdata](https://synthdata.com)
- Deployed on [Railway](https://railway.app)
- Database by [Supabase](https://supabase.com)

## 💬 Support

- Twitter: [@miyamotolabs](https://twitter.com/miyamotolabs)
- Discord: [EasyPoly Server](#)
- Issues: [GitHub Issues](https://github.com/your-repo/synthsignals/issues)

---

**⚠️ Disclaimer:** This is a tool for research purposes. Always DYOR before trading. Past performance does not guarantee future results.
