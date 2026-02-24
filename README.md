# 🎯 EasyPoly

> **Democratizing Polymarket Alpha via Synthdata Intelligence**
> 
> AI-powered prediction market analytics + copy trading platform

[![Hackathon](https://img.shields.io/badge/Synthdata-Hackathon%202026-blue)](https://dashboard.synthdata.co/hackathon)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## 📖 Overview

**EasyPoly** combines Synthdata's probabilistic forecasts with algorithmic trader discovery to help retail traders find and capitalize on mispriced Polymarket markets.

### The Problem

- Retail traders can't compete with quants and whales
- Prediction markets are inefficient but hard to analyze
- Top-performing traders are invisible

### The Solution

EasyPoly layers AI intelligence on top of Polymarket:

1. **🔍 Find Alpha** — Synthdata API identifies mispriced markets
2. **👥 Discover Winners** — Algorithmic ranking of top traders
3. **📋 Copy Trades** — One-click copy trading with risk controls

---

## ✨ Features

### Current (Beta MVP)
- ✅ Synthdata API integration
- ✅ Market analysis dashboard
- ✅ Conviction scoring (multi-signal)
- ✅ Top trader leaderboard
- ✅ Copy trade interface

### Coming Soon
- 🔄 Real-time predictions
- 🤖 Automated trader scanning
- 📱 Push notifications
- 🏆 Social features

---

## 🏗️ Architecture

```
easypoly/
├── frontend/     # Next.js 15 web app
├── engine/       # Python AI prediction engine
├── bot/          # Node.js trading automation
└── docs/         # Documentation
```

### Tech Stack

**Frontend**
- Next.js 15, React, TypeScript
- TailwindCSS, shadcn/ui
- Recharts

**Backend**
- Python 3.11+ (FastAPI)
- Node.js 18+

**APIs & Data Sources**
- Synthdata (probabilistic forecasts)
- Perplexity (AI-powered market research & news)
- Polymarket (trading & market data)

**Database**
- Supabase (PostgreSQL)
- Redis (caching, coming soon)

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- Synthdata API key
- Polymarket access

### Installation

```bash
# Clone repo
git clone https://github.com/miyamoto-labs/easypoly.git
cd easypoly

# Frontend
cd frontend
npm install
cp .env.example .env.local
# Add SYNTHDATA_API_KEY to .env.local
npm run dev

# Engine (separate terminal)
cd ../engine
pip install -r requirements.txt
cp .env.example .env
# Add API keys to .env
python main.py

# Bot (optional)
cd ../bot
npm install
cp .env.example .env
node src/index.js
```

**Frontend:** http://localhost:3000  
**Engine API:** http://localhost:8000

---

## 📊 How We Use Synthdata

### 1. Market Analysis

Query Synthdata for BTC/ETH predictions and compare vs. Polymarket odds:

```python
response = requests.get(
    "https://api.synthdata.co/insights/polymarket/up-down/hourly",
    headers={"Authorization": f"Apikey {API_KEY}"},
    params={"asset": "BTC"}
)

synth_prob = response.json()['synth_probability_up']
market_prob = response.json()['polymarket_probability_up']
edge = synth_prob - market_prob

if abs(edge) > 0.05:  # 5% mispricing
    print(f"ALPHA SIGNAL: {edge:.1%} edge detected")
```

### 2. Conviction Scoring

Multi-signal scoring engine:

- **40%** — Synthdata prediction accuracy
- **30%** — Trading volume patterns
- **30%** — Trader behavior signals

**Output:** Conviction score (0-100) for each market

### 3. Trader Evaluation

Analyze trader performance on Synthdata-accurate markets:

- Identify traders who align with Synthdata signals
- Multi-dimensional ranking (ROI, win rate, recency)
- Red flag detection (wash trading, low sample size)

**Output:** "Synthdata Alpha Correlation" score per trader

### 4. AI-Powered Market Research

Use Perplexity API for real-time market intelligence:

```python
# Query Perplexity for market context
response = perplexity.query(
    f"What are the key factors affecting {market_question}?"
)

# Extract insights
context = response['answer']
sources = response['citations']

# Feed into conviction engine
conviction_boost = analyze_sentiment(context)
```

**Use cases:**
- News event analysis for market context
- Sentiment analysis on trending topics
- Verification of market assumptions
- Real-time research for conviction scoring

---

## 📸 Screenshots

*Coming soon — dashboard, leaderboard, copy trade UI*

---

## 🗺️ Roadmap

**Q1 2026** (Hackathon)
- Beta launch with manual curation
- Synthdata integration
- Basic copy trading

**Q2 2026**
- Automated trader discovery
- Real-time notifications
- Mobile-responsive UI

**Q3 2026**
- Portfolio management
- Risk controls
- Premium features

**Q4 2026**
- Mobile app
- Social features
- Institutional tier

---

## 🤝 Team

**Erik Austheim** — Founder & Developer
- Norway-based trader & builder
- 3+ years Polymarket experience
- Built SuperBTCBot, polymarket-trader

**Miyamoto** — AI Co-Founder
- Autonomous AI systems
- MIYAMOTO LABS

---

## 📜 License

MIT License — see [LICENSE](LICENSE)

---

## 🔗 Links

- **Live App:** [easypoly.lol](https://www.easypoly.lol) ✅
- **Twitter:** [@easypoly_lol](https://twitter.com/easypoly_lol)
- **GitHub:** [miyamoto-labs/easypoly](https://github.com/miyamoto-labs/easypoly)

---

## 🙏 Built With

- [Synthdata](https://synthdata.co) — Probabilistic forecasting
- [Perplexity](https://www.perplexity.ai) — AI-powered market research
- [Polymarket](https://polymarket.com) — Prediction markets
- [Supabase](https://supabase.com) — Backend infrastructure
- [MIYAMOTO LABS](https://miyamotolabs.com) — Autonomous AI systems

---

**Made for the Synthdata Predictive Intelligence Hackathon 2026** 🚀
