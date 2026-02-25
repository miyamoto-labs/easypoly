# Deployment Checklist

## Pre-Deployment

### 1. Telegram Bot Setup
- [ ] Create production bot with @BotFather
- [ ] Set bot name and description
- [ ] Set bot commands (see README)
- [ ] Configure bot privacy settings
- [ ] Get bot token

### 2. Supabase Setup
- [ ] Create production Supabase project
- [ ] Run database migrations (`001_initial_schema.sql`)
- [ ] Verify tables created successfully
- [ ] Disable RLS or configure policies
- [ ] Get connection strings (URL, anon key, service key)
- [ ] Seed initial data (curated traders, if any)

### 3. Privy Setup
- [ ] Create production Privy app
- [ ] Enable "Embedded Wallets" feature
- [ ] Configure Telegram as login method
- [ ] Set allowed domains (if applicable)
- [ ] Get App ID and App Secret
- [ ] Test wallet creation in Privy dashboard

### 4. Polymarket Integration
- [ ] Get API key (if needed)
- [ ] Test API access (fetch markets, traders)
- [ ] Verify rate limits
- [ ] Set up wallet for trade execution (if self-custodial)

### 5. Railway Setup
- [ ] Create Railway account
- [ ] Create new project
- [ ] Connect GitHub repo (optional)
- [ ] Add environment variables (see below)

## Environment Variables

Add these in Railway dashboard:

```
TELEGRAM_BOT_TOKEN=<your_production_token>
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_KEY=<your_anon_key>
SUPABASE_SERVICE_KEY=<your_service_role_key>
PRIVY_APP_ID=<your_app_id>
PRIVY_APP_SECRET=<your_app_secret>
POLYMARKET_API_KEY=<optional>
CLOB_HOST=https://clob.polymarket.com
GAMMA_API=https://gamma-api.polymarket.com
NODE_ENV=production
PORT=3000
PLATFORM_FEE_PERCENT=1.0
REFERRAL_COMMISSION_PERCENT=50.0
MIN_TRADE_AMOUNT=1
MAX_TRADE_AMOUNT=1000
MAX_COPY_TRADES_PER_DAY=20
MIN_TRADER_HISTORY_DAYS=7
```

## Deployment Steps

### Option A: Railway CLI

```bash
# Install CLI
npm install -g @railway/cli

# Login
railway login

# Link project
railway link

# Deploy
railway up
```

### Option B: Railway Dashboard

1. Go to [Railway Dashboard](https://railway.app)
2. New Project → Deploy from GitHub repo
3. Select your repo
4. Set root directory to `telegram-bot`
5. Add all environment variables
6. Click "Deploy"

### Option C: GitHub Actions (Advanced)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Railway

on:
  push:
    branches: [main]
    paths:
      - 'telegram-bot/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install -g @railway/cli
      - run: railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

## Post-Deployment

### 1. Verify Bot
- [ ] Bot shows as "Running" in Railway
- [ ] Check logs: `railway logs`
- [ ] Should see: "🤖 EasyPoly Telegram Bot is running!"
- [ ] Message bot: `/start` - should respond

### 2. Test Core Features
- [ ] Wallet creation works
- [ ] Daily picks load
- [ ] Copy trading setup works
- [ ] Database writes succeed
- [ ] Background jobs running (check logs)

### 3. Monitor
- [ ] Check Railway metrics (CPU, memory)
- [ ] Monitor error rate in logs
- [ ] Verify background jobs execute (every 2 min)
- [ ] Test notification delivery

### 4. Database Health
```sql
-- Check initial state
SELECT COUNT(*) as users FROM telegram_users;
SELECT COUNT(*) as picks FROM scanner_picks;
SELECT COUNT(*) as traders FROM ep_traders;
```

### 5. Enable Monitoring

Add monitoring service (optional):
- Sentry for error tracking
- Mixpanel/PostHog for analytics
- UptimeRobot for uptime monitoring

## Rollback Plan

If deployment fails:

### Railway
```bash
# Revert to previous version
railway rollback

# Or redeploy specific version
railway up --detach
```

### Database
```sql
-- Migrations are one-way
-- To rollback, manually drop tables (DANGEROUS!)
DROP TABLE IF EXISTS notification_queue;
DROP TABLE IF EXISTS trader_activity;
DROP TABLE IF EXISTS referrals;
DROP TABLE IF EXISTS bot_trades;
DROP TABLE IF EXISTS copy_trades;
DROP TABLE IF EXISTS telegram_users;
```

## Security Checklist

- [ ] Environment variables in Railway (not in code)
- [ ] Service role key kept secret
- [ ] Bot token never committed to Git
- [ ] Database backups enabled (Supabase auto-backup)
- [ ] Privy secrets rotated if exposed
- [ ] Rate limiting configured
- [ ] Input validation on all user inputs

## Performance Optimization

- [ ] Database indexes created (migrations do this)
- [ ] Connection pooling enabled (Supabase default)
- [ ] Cache frequently accessed data (optional)
- [ ] Optimize database queries (use views)
- [ ] Monitor response times

## Production Readiness

- [ ] Error handling in all commands
- [ ] Graceful shutdown on SIGTERM
- [ ] Database connection retry logic
- [ ] Webhook mode vs polling (polling is default, OK for MVP)
- [ ] Rate limiting for API calls
- [ ] User feedback on errors

## Go Live Announcement

Once stable:

1. **Soft Launch** - Share with small group
2. **Monitor for 24h** - Fix any issues
3. **Public Launch** - Tweet, Discord, etc.
4. **Support Ready** - Monitor support channel

## Troubleshooting Common Issues

### Bot not starting
- Check environment variables
- Verify database connection
- Check Railway logs for errors

### Database connection fails
- Verify Supabase URL and keys
- Check if project is paused (free tier)
- Test connection from local

### Privy errors
- Check App ID and Secret
- Verify Telegram is enabled
- Test in Privy playground

### Background jobs not running
- Check Railway logs for cron execution
- Verify cron syntax
- Test jobs manually

## Success Metrics

Track these post-launch:

- [ ] Active users (daily)
- [ ] Trades executed
- [ ] Copy trades set up
- [ ] Referrals created
- [ ] Platform revenue
- [ ] Error rate < 1%
- [ ] Response time < 2s

---

🚀 **Ready to deploy!**
