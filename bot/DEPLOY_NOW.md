# 🚀 EasyPoly Bot - Deploy Now

## ✅ Changes Committed

**Commit:** `8e4649f`

**What changed:**
- `/start` sends demo pick immediately (BTC $150k example)
- Demo pick has full UI (AI reasoning + BET buttons)
- Clicking BET → prompts wallet connection
- Two wallet options: web or manual

---

## 🚀 Deploy to Railway

### Option 1: Railway Dashboard (Easiest)
1. Go to https://railway.app/dashboard
2. Find "easypoly-bot" project
3. Click "Deploy" or "Redeploy"
4. Wait for build to complete (~2 min)
5. ✅ Done!

### Option 2: Git Push (If Connected)
```bash
# From easypoly-bot directory
git push origin main
```

Railway will auto-deploy on push.

### Option 3: Manual Upload
1. ZIP the `easypoly-bot` folder
2. Upload to Railway dashboard
3. Railway builds and deploys

---

## ✅ Test After Deploy

**1. Send /start to @EasyPolyBot**

Expected:
```
🎯 Welcome to EasyPoly!

AI-curated Polymarket picks delivered 3x daily.

Here's what you'll receive:

🔥 DEMO PICK
Will Bitcoin hit $150k before July 2026?

📈 Side: YES
💰 Market Price: 38¢
🎯 Our Estimate: 62%
📊 Edge: +24%

💡 [AI reasoning...]

[🎯 $5] [💰 $10] [🔥 $25]
[⏭️ SKIP]

💡 Like what you see?
Connect your wallet to start placing bets...
```

**2. Click BET button**

Expected:
```
🔗 Connect Your Wallet to Place Bets

This was a demo pick to show you what you'll receive.

[🔗 Connect Polymarket Account]
[⚙️ Manual Setup (API Keys)]
```

---

## 🔧 Environment Variables

Make sure these are set in Railway:

```
BOT_TOKEN=<your_telegram_token>
WELCOME_LANDING_URL=https://easypoly.lol
TRADER_URL=https://trader-production-a096.up.railway.app
TRADER_KEY=pm-trader-erik-2026
API_SECRET=easypoly-2026
ENCRYPTION_KEY=<32_byte_hex>
```

**Most important:** `WELCOME_LANDING_URL` must be set!

---

## 🎉 You're Ready!

Once deployed, your bot will:
- ✅ Send demo picks on /start
- ✅ Prompt wallet connection on BET
- ✅ Support both web + manual connection
- ✅ Ready for real picks via /broadcast

**Ship it! 🚀**
