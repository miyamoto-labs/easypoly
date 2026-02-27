# ⚡ SynthSignals - Quick Start (5 Minutes)

## 🎯 Goal
Get SynthSignals running locally with mock data.

## 📋 Prerequisites
- Node.js 18+ installed
- 5 minutes of your time

## 🚀 Steps

### 1. Install (1 min)
```bash
cd /Users/erik/.openclaw/workspace/easypoly-clean/synthsignals
npm install
```

### 2. Create Telegram Bot (2 min)
```
1. Open Telegram
2. Search: @BotFather
3. Send: /newbot
4. Name: SynthSignals Bot
5. Username: synthsignals_bot
6. Copy the token
```

### 3. Configure (1 min)
```bash
# Edit .env (already created, just update TELEGRAM_BOT_TOKEN)
nano .env

# Update this line:
TELEGRAM_BOT_TOKEN=your_actual_token_here
```

### 4. Run (1 min)
```bash
npm start
```

**Expected output:**
```
✅ Configuration validated
✅ Supabase client initialized
✅ Telegram bot initialized
⏰ Monitoring started (polling every 5 minutes)
```

### 5. Test in Telegram
```
1. Search for your bot
2. Send: /start
3. Bot responds → ✅ Working!
4. Send: /status
5. Shows system status → ✅ Monitoring active!
```

## 🎬 Demo Mode

Want to see alerts without waiting?

```bash
node src/demo.js
```

Shows 4 formatted alerts with:
- BTC UP: +18.5% edge 🔥🔥🔥
- SOL UP: +16.7% edge 🔥🔥🔥
- Beautiful formatting
- Direct Polymarket links

## 🔧 Troubleshooting

### Bot not responding?
```bash
# Check bot token is correct
grep TELEGRAM_BOT_TOKEN .env

# Check logs
# Should see "Telegram bot initialized"
```

### Supabase errors?
```
Normal! Using test credentials.
For production, setup real Supabase (see README.md)
```

### Want to test with real data?
```bash
# Get Synthdata API key → .env
SYNTHDATA_API_KEY=your_key_here

# Restart
npm start
```

## 📚 Next Steps

- **Production Setup:** Read `README.md`
- **Deploy:** Read `DEPLOYMENT.md`
- **Demo Video:** Read `DEMO_SCRIPT.md`
- **Full Details:** Read `BUILD_SUMMARY.md`

## ✅ Success!

If you:
- ✅ See "Monitoring started" in terminal
- ✅ Bot responds to `/start` in Telegram
- ✅ `/status` shows system active

**You're ready!** 🎉

Now deploy to Railway or continue testing locally.

---

**Questions?** Read the full `README.md` or `BUILD_SUMMARY.md`
