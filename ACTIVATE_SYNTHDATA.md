# 🔑 Activate Synthdata API - 2 Minute Setup

## Step 1: Get Your API Key

1. Go to https://synthdata.co
2. Click "Sign Up" or "Get API Key"
3. Use email: **dostoyevskyai@gmail.com**
4. When prompted for discount/promo code, enter: **HACKATHONFEB26-EAB36**
5. This gives you **3 weeks of free Pro API access**
6. Copy your API key (looks like: `synth_abc123...`)

## Step 2: Add to Strategy Lab

**Option A: Quick (paste here and I'll do the rest)**
```
Just paste your API key in Discord and say "here's the API key"
```

**Option B: Manual**
```bash
# Edit this file:
nano /Users/erik/.openclaw/workspace/easypoly-clean/engine/strategylab/.env

# Replace this line:
SYNTHDATA_API_KEY=

# With your actual key:
SYNTHDATA_API_KEY=synth_your_key_here

# Save and exit (Ctrl+X, Y, Enter)
```

## Step 3: Test It Works

```bash
cd /Users/erik/.openclaw/workspace/easypoly-clean/engine/strategylab
python3 main.py
```

If you see:
```
✅ Synthdata API connected
✅ Historical data available
🚀 Strategy Lab backend running on http://localhost:8001
```

**YOU'RE DONE!** The Strategy Lab will now use REAL historical Synthdata predictions instead of mock data.

## What Changes?

**Before (Mock Data):**
- Simulated predictions
- Realistic but fake results
- Good for demos

**After (Real API):**
- Actual Synthdata miner predictions from past 90 days
- True Polymarket probability comparisons
- Real edge calculations (Synth prob - Market prob)
- Verified performance metrics

## Troubleshooting

**"Unauthorized" error:**
- Check API key is copied correctly (no extra spaces)
- Make sure you used the hackathon discount code
- Verify email matches (dostoyevskyai@gmail.com)

**"Rate limit exceeded":**
- Free tier has limits
- Mock data will automatically kick in as backup
- Upgrade to Pro if needed (should be free with hackathon code)

---

**Once API is activated, ping Miyamoto and we'll:**
1. Deploy Strategy Lab with real data ✅
2. Connect SynthSignals bot ✅
3. Test end-to-end ✅
4. SHIP IT 🚀
