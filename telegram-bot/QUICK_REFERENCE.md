# Quick Reference Card

## 🚀 5-Minute Deploy

```bash
cd telegram-bot
npm install
cp .env.example .env
# Edit .env with your credentials
railway up
```

## 📝 Essential Commands

```bash
# Local development
npm run dev

# Production start
npm start

# Deploy to Railway
railway up

# View logs
railway logs --follow

# Database migrations
# Run in Supabase SQL Editor: migrations/001_initial_schema.sql
```

## 🔑 Required Credentials

1. **Telegram:** [@BotFather](https://t.me/botfather) → `/newbot`
2. **Supabase:** [supabase.com](https://supabase.com) → New Project
3. **Privy:** [privy.io](https://privy.io) → Create App

## 📊 Bot Commands

```
/start    - Welcome & onboarding
/wallet   - Manage wallet
/picks    - Daily AI picks
/copy     - Copy trading
/portfolio - View positions
/settings - Configure bot
/help     - Show help
```

## 🗂 Key Files

```
src/bot.js              - Main entry point
src/commands/           - Command handlers
src/services/           - Business logic
src/db/supabase.js      - Database queries
migrations/*.sql        - Database schema
```

## 🐛 Troubleshooting

```bash
# Bot not responding
railway logs | grep Error

# Database issues
# Check Supabase dashboard → Database → Tables

# Missing env vars
railway variables

# Test locally
npm run dev
```

## 📊 Database Queries

```sql
-- Active users
SELECT COUNT(*) FROM telegram_users WHERE wallet_address IS NOT NULL;

-- Today's trades
SELECT * FROM bot_trades WHERE created_at >= CURRENT_DATE;

-- Copy trading stats
SELECT trader_address, COUNT(*) FROM copy_trades GROUP BY trader_address;
```

## 🎯 Quick Test

1. Message your bot: `/start`
2. Click "Connect Wallet"
3. Click "Daily Picks"
4. Try copy trading setup

## 📚 Full Docs

- `DELIVERY.md` - What's been built
- `README.md` - Complete setup guide
- `TESTING.md` - Testing procedures
- `DEPLOYMENT_CHECKLIST.md` - Production steps
- `PROJECT_SUMMARY.md` - Full overview

## 🔗 Useful Links

- Telegram Bots: https://core.telegram.org/bots
- Telegraf Docs: https://telegraf.js.org
- Supabase: https://supabase.com/docs
- Privy: https://docs.privy.io
- Railway: https://docs.railway.app

---

**Built by MIYAMOTO LABS 🚀**
