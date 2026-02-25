# Strategy Lab - Quick Start Guide ⚡

**Get Strategy Lab running in 60 seconds.**

---

## 1. Start Backend (30 seconds)

```bash
cd /Users/erik/.openclaw/workspace/easypoly-clean/engine/strategylab
pip install -r requirements.txt
python main.py
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8001
```

**Test it:**
```bash
curl http://localhost:8001/
# Should return: {"status": "ok", "service": "Strategy Lab API", ...}
```

---

## 2. Start Frontend (30 seconds)

Open a **new terminal:**

```bash
cd /Users/erik/.openclaw/workspace/easypoly-clean/frontend
npm run dev
```

You should see:
```
- Local:   http://localhost:3000
```

**Visit:** http://localhost:3000/dashboard/lab

---

## 3. Run Your First Backtest (30 seconds)

1. **Select** "Gopfan2 Strategy" (already selected)
2. **Click** "Run Backtest" 🚀
3. **See results:**
   - Total Return: +$850
   - Win Rate: 58.5%
   - Sharpe Ratio: 1.42
   - 120 trades

4. **Explore:**
   - Scroll to see equity curve
   - View trade-by-trade breakdown
   - Click "Export CSV" to download

---

## 4. Try Custom Strategy (30 seconds)

1. **Click** "Custom Parameters" button
2. **Adjust sliders:**
   - Edge Threshold: 12%
   - Confidence: 70%
   - Position Size: $150
3. **Click** "Run Backtest" 🚀
4. **Compare** results to Gopfan2

---

## Troubleshooting

**Backend won't start?**
```bash
# Check Python version (need 3.10+)
python3 --version

# Try with Python 3 explicitly
python3 main.py
```

**Frontend shows "Backend error"?**
```bash
# Make sure backend is running
curl http://localhost:8001/

# Check the backend terminal for errors
```

**No data showing?**
- Normal! Mock data is being generated automatically
- Check browser console (F12) for errors
- Refresh the page

---

## What You're Seeing

**Without a Synthdata API key:**
- System uses **realistic mock data**
- ~58% win rate (realistic for good predictions)
- Synthdata probabilities have edge over market
- Hundreds of data points generated

**This is by design!** Perfect for demos and testing.

---

## Demo Checklist

Before showing to others:

- [ ] Backend running on port 8001
- [ ] Frontend running on port 3000
- [ ] Can access `/dashboard/lab`
- [ ] Gopfan2 Strategy loads
- [ ] Backtest executes in <2 seconds
- [ ] Charts render smoothly
- [ ] CSV export works

---

## Next Steps

1. **Practice demo** - Run through demo script in `STRATEGY_LAB.md`
2. **Read docs** - Check `STRATEGY_LAB.md` for full guide
3. **Deploy** (optional) - See `STRATEGY_LAB_CHECKLIST.md` for deployment
4. **Get API key** (later) - Replace mock data with real Synthdata

---

## Quick Commands Reference

**Backend:**
```bash
cd engine/strategylab
python main.py
```

**Frontend:**
```bash
cd frontend
npm run dev
```

**Test Backend:**
```bash
# Health check
curl http://localhost:8001/

# List strategies
curl http://localhost:8001/strategies

# Run backtest
curl -X POST http://localhost:8001/backtest \
  -H "Content-Type: application/json" \
  -d '{"strategy_name": "Gopfan2 Strategy", "days_back": 30}'
```

---

**You're ready to go! 🚀**

Questions? Check `STRATEGY_LAB.md` for the full guide.
