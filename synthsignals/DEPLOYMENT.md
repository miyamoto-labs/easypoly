# 🚀 SynthSignals Deployment Guide

Complete guide to deploying SynthSignals to production.

## 🎯 Deployment Options

1. **Railway** (Recommended) - Easiest, $5/month
2. **Heroku** - Free tier available
3. **DigitalOcean App Platform** - $5/month
4. **AWS EC2** - More complex, pay-as-you-go
5. **VPS** (DigitalOcean, Linode) - Full control, $5-10/month

## 🚂 Railway Deployment (Recommended)

### Why Railway?

- ✅ Easiest setup
- ✅ Automatic deployments from GitHub
- ✅ Built-in environment variables
- ✅ Free tier available ($5 credit/month)
- ✅ Great for Node.js apps

### Step-by-Step

1. **Create Railway account**
   - Go to https://railway.app
   - Sign up with GitHub

2. **Create new project**
   ```bash
   # Install Railway CLI
   npm i -g @railway/cli
   
   # Login
   railway login
   
   # Create project
   railway init
   ```

3. **Add environment variables**
   
   In Railway dashboard → Variables tab:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_KEY=eyJhbGc...
   SYNTHDATA_API_KEY=your_api_key
   EDGE_THRESHOLD=15
   POLL_INTERVAL_MS=300000
   NODE_ENV=production
   ```

4. **Deploy**
   ```bash
   railway up
   ```

5. **Check logs**
   ```bash
   railway logs
   ```

6. **Connect to GitHub (optional)**
   - Railway dashboard → Settings → Connect GitHub repo
   - Auto-deploy on push to main branch

### Railway `railway.json` Config

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

## 🟣 Heroku Deployment

### Step-by-Step

1. **Install Heroku CLI**
   ```bash
   npm install -g heroku
   ```

2. **Login**
   ```bash
   heroku login
   ```

3. **Create app**
   ```bash
   heroku create synthsignals
   ```

4. **Add environment variables**
   ```bash
   heroku config:set TELEGRAM_BOT_TOKEN=your_token
   heroku config:set SUPABASE_URL=your_url
   heroku config:set SUPABASE_SERVICE_KEY=your_key
   heroku config:set SYNTHDATA_API_KEY=your_api_key
   ```

5. **Create Procfile**
   ```
   worker: npm start
   ```

6. **Deploy**
   ```bash
   git push heroku main
   ```

7. **Scale worker**
   ```bash
   heroku ps:scale worker=1
   ```

8. **Check logs**
   ```bash
   heroku logs --tail
   ```

## 🌊 DigitalOcean App Platform

### Step-by-Step

1. Go to https://cloud.digitalocean.com/apps

2. Click "Create App"

3. Connect GitHub repo

4. Configure:
   - **Source Directory:** `synthsignals/`
   - **Build Command:** `npm install`
   - **Run Command:** `npm start`

5. Add environment variables in dashboard

6. Choose $5/month plan

7. Deploy!

## 🖥️ VPS Deployment (DigitalOcean Droplet)

### Step-by-Step

1. **Create droplet**
   - Ubuntu 22.04 LTS
   - $5/month plan (1GB RAM)

2. **SSH into server**
   ```bash
   ssh root@your_server_ip
   ```

3. **Install Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

4. **Install PM2 (process manager)**
   ```bash
   npm install -g pm2
   ```

5. **Clone repo**
   ```bash
   git clone https://github.com/your-repo/easypoly-clean.git
   cd easypoly-clean/synthsignals
   ```

6. **Install dependencies**
   ```bash
   npm install
   ```

7. **Create .env file**
   ```bash
   nano .env
   # Paste your environment variables
   ```

8. **Start with PM2**
   ```bash
   pm2 start src/index.js --name synthsignals
   pm2 save
   pm2 startup
   ```

9. **Monitor**
   ```bash
   pm2 logs synthsignals
   pm2 monit
   ```

10. **Auto-restart on reboot**
    ```bash
    pm2 startup systemd
    # Run the command it outputs
    pm2 save
    ```

## 🔧 Environment Variables Checklist

Before deploying, ensure you have:

- [ ] `TELEGRAM_BOT_TOKEN` - From @BotFather
- [ ] `SUPABASE_URL` - From Supabase dashboard
- [ ] `SUPABASE_SERVICE_KEY` - From Supabase dashboard (service role key)
- [ ] `SYNTHDATA_API_KEY` - From Synthdata (optional for testing)
- [ ] `EDGE_THRESHOLD` - Default: 15
- [ ] `POLL_INTERVAL_MS` - Default: 300000 (5 minutes)
- [ ] `NODE_ENV` - Set to "production"

## 🗄️ Supabase Setup

1. Create project at https://supabase.com

2. Go to SQL Editor

3. Run this SQL:
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

   CREATE INDEX idx_synth_signals_timestamp ON synth_signals(timestamp DESC);
   CREATE INDEX idx_synth_signals_asset ON synth_signals(asset);
   CREATE INDEX idx_synth_signals_alerted ON synth_signals(alerted);
   ```

4. Get credentials:
   - Settings → API → URL
   - Settings → API → service_role key (not anon key!)

## 🧪 Testing Production Deployment

After deploying:

1. **Check bot is online**
   - Open Telegram
   - Search for your bot
   - Send `/start`
   - Should respond immediately

2. **Verify monitoring**
   - Wait 5 minutes
   - Check logs for "Poll cycle complete"
   - Send `/status` to bot

3. **Test alerts**
   - Temporarily lower edge threshold to 5%
   - Wait for next poll
   - Should receive test alert

4. **Monitor database**
   - Check Supabase dashboard
   - Table Editor → synth_signals
   - Should see new rows every 5 minutes

## 🚨 Troubleshooting

### Bot not responding

```bash
# Check logs
railway logs  # or heroku logs --tail
pm2 logs synthsignals

# Common issues:
# - Wrong bot token
# - Bot not started in Telegram (send /start first)
# - Network/firewall blocking Telegram API
```

### Database errors

```bash
# Check Supabase status
# Settings → API → Connection pooling

# Common issues:
# - Wrong service key (using anon key instead)
# - Table not created
# - Row Level Security blocking writes
```

### No signals

```bash
# Check Synthdata API
# - API key valid?
# - Rate limits hit?
# - API endpoint changed?

# Test locally first:
npm test
```

## 📊 Monitoring

### Railway
- Dashboard → Metrics tab
- Logs tab for real-time logs
- Set up alerts for errors

### PM2 (VPS)
```bash
# Real-time monitoring
pm2 monit

# Logs
pm2 logs synthsignals --lines 100

# Restart if needed
pm2 restart synthsignals
```

### Uptime Monitoring
- Use UptimeRobot (free)
- Ping your bot every 5 minutes
- Alert if down

## 💰 Cost Estimate

| Platform | Monthly Cost | Best For |
|----------|-------------|----------|
| Railway | $5 | Quick deployment |
| Heroku | Free - $7 | Hobby projects |
| DigitalOcean | $5 | Full control |
| AWS EC2 | $3-10 | Scalability |
| VPS | $5-10 | Maximum control |

## 🔐 Security

- [ ] Never commit `.env` file
- [ ] Use service role key (not anon key) for Supabase
- [ ] Rotate API keys regularly
- [ ] Enable 2FA on all services
- [ ] Monitor logs for suspicious activity

## 🎉 Success Checklist

- [ ] Bot responds to `/start`
- [ ] Bot sends `/status` correctly
- [ ] Logs show "Poll cycle complete" every 5 minutes
- [ ] Database shows new signals
- [ ] Web dashboard loads and shows signals
- [ ] Alerts work (test with low threshold)
- [ ] Monitoring/alerts set up
- [ ] Documentation updated

---

**Need help?** Open an issue or DM [@miyamotolabs](https://twitter.com/miyamotolabs)
