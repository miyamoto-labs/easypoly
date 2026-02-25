# EasyPoly Telegram Copy Trading Bot

Simple Telegram bot for Polymarket copy trading + daily AI picks.

## Features

- 📊 **Daily AI Picks** - Top predictions from EasyPoly's analysis engine
- 👥 **Copy Trading** - Mirror trades from top Polymarket traders
- 💰 **One-Click Trading** - Buy with $10/$25/$50 buttons
- 💼 **Portfolio Tracking** - View positions, P&L, performance
- 🎁 **Referral System** - Earn 50% commission from referred users
- 🔐 **Embedded Wallets** - Privy-powered wallets (no seed phrases)

## Tech Stack

- **Framework:** Telegraf (Node.js Telegram bot library)
- **Database:** Supabase (PostgreSQL)
- **Wallets:** Privy (embedded wallets)
- **Blockchain:** Polygon (USDC for trades)
- **Hosting:** Railway

## Setup

### Prerequisites

- Node.js 18+
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Supabase account
- Privy account
- Polymarket API access

### 1. Clone & Install

```bash
cd telegram-bot
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in your credentials:

```env
# Get from @BotFather
TELEGRAM_BOT_TOKEN=

# Get from Supabase dashboard
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_KEY=

# Get from Privy dashboard
PRIVY_APP_ID=
PRIVY_APP_SECRET=

# Polymarket (optional for testing)
POLYMARKET_API_KEY=
```

### 3. Database Setup

Run the migration to create tables:

```bash
# Option 1: Via Supabase dashboard
# Copy the contents of migrations/001_initial_schema.sql
# Paste into Supabase SQL Editor and run

# Option 2: Via psql (if you have direct access)
psql -h your-db-host -U postgres -d postgres -f migrations/001_initial_schema.sql
```

### 4. Create Telegram Bot

1. Message [@BotFather](https://t.me/botfather)
2. Send `/newbot`
3. Follow prompts to name your bot
4. Copy the bot token to `.env`
5. Set commands:
   ```
   /setcommands
   start - Welcome & onboarding
   wallet - Manage your wallet
   picks - View daily AI picks
   copy - Copy trading setup
   portfolio - View positions & P&L
   settings - Configure bot
   help - Show help
   ```

### 5. Configure Privy

1. Go to [Privy Dashboard](https://dashboard.privy.io)
2. Create new app
3. Enable "Embedded Wallets"
4. Copy App ID and App Secret to `.env`
5. Add Telegram as login method

### 6. Run Locally

```bash
npm start
```

Or with auto-reload:

```bash
npm run dev
```

## Deployment (Railway)

### 1. Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init
```

### 2. Set Environment Variables

Go to Railway dashboard and add all variables from `.env`:

- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_SERVICE_KEY`
- `PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `NODE_ENV=production`

### 3. Deploy

```bash
railway up
```

Or connect GitHub repo for auto-deploys:

1. Push code to GitHub
2. In Railway: New Project → Deploy from GitHub repo
3. Select the repo and `telegram-bot` folder
4. Add environment variables
5. Deploy!

### 4. Verify

```bash
# Check logs
railway logs

# You should see:
# ✅ Database connected
# ✅ Background jobs started
# 🤖 EasyPoly Telegram Bot is running!
```

## Usage

### For Users

1. Start bot: `/start`
2. Create wallet: Tap "Connect Wallet"
3. Deposit USDC to the provided address
4. Trade:
   - `/picks` - View and trade AI picks
   - `/copy` - Set up copy trading
5. Track: `/portfolio`

### For Admins

Monitor the bot:

```bash
railway logs --follow
```

Check database:

```sql
-- Active users
SELECT COUNT(*) FROM telegram_users WHERE wallet_address IS NOT NULL;

-- Today's trades
SELECT COUNT(*), SUM(amount) FROM bot_trades 
WHERE created_at >= CURRENT_DATE;

-- Copy trading activity
SELECT trader_address, COUNT(*) as copiers 
FROM copy_trades 
WHERE status = 'active' 
GROUP BY trader_address;
```

## File Structure

```
telegram-bot/
├── src/
│   ├── bot.js              # Main entry point
│   ├── commands/           # Command handlers
│   │   ├── start.js
│   │   ├── wallet.js
│   │   ├── picks.js
│   │   ├── copy.js
│   │   ├── portfolio.js
│   │   └── settings.js
│   ├── services/           # Business logic
│   │   ├── privy.js        # Wallet management
│   │   ├── polymarket.js   # Polymarket API
│   │   ├── copyTrade.js    # Copy trading logic
│   │   └── referrals.js    # Referral system
│   ├── db/
│   │   └── supabase.js     # Database client
│   └── utils/
│       ├── validation.js   # Input validation
│       └── formatting.js   # Message formatting
├── migrations/
│   └── 001_initial_schema.sql
├── package.json
├── .env.example
└── README.md
```

## Revenue Model

- **Platform Fee:** 1% on winning trades
- **Referral Commission:** 50% of fees go to referrer
- **Free to Use:** No subscription or upfront costs

## Monitoring

### Health Check

```bash
curl https://your-bot.railway.app/health
```

### Logs

```bash
railway logs --tail 100
```

### Database Queries

Key metrics to monitor:

```sql
-- User growth
SELECT DATE(created_at), COUNT(*) 
FROM telegram_users 
GROUP BY DATE(created_at) 
ORDER BY DATE(created_at) DESC;

-- Trading volume
SELECT DATE(created_at), SUM(amount) as volume 
FROM bot_trades 
GROUP BY DATE(created_at) 
ORDER BY DATE(created_at) DESC;

-- Copy trading adoption
SELECT COUNT(*) FROM copy_trades WHERE status = 'active';
```

## Troubleshooting

### Bot not responding

1. Check Railway logs: `railway logs`
2. Verify token: Message bot directly
3. Check environment variables in Railway dashboard

### Database errors

1. Verify Supabase credentials
2. Check RLS policies (should be disabled for service key)
3. Run migrations again

### Privy wallet errors

1. Check Privy dashboard for errors
2. Verify app ID and secret
3. Ensure Telegram is enabled as login method

### Copy trading not working

1. Check cron job logs
2. Verify Polymarket API access
3. Test trader address manually

## Development

### Run tests

```bash
npm test
```

### Lint code

```bash
npm run lint
```

### Database migrations

Add new migration:

```bash
# Create file: migrations/002_your_migration.sql
# Run it in Supabase SQL Editor
```

## Support

- Documentation: [EasyPoly Docs](https://easypoly.io/docs)
- Telegram: [@easypoly_support](https://t.me/easypoly_support)
- GitHub Issues: [Open Issue](https://github.com/your-repo/issues)

## License

MIT

---

Built by [MIYAMOTO LABS](https://miyamotolabs.com) 🚀
