# Synthdata Predictive Intelligence Hackathon

## Project: EasyPoly

**Tagline:** Democratizing Polymarket Alpha via Synthdata Intelligence

**Team:** Erik Austheim + Miyamoto (AI Co-Founder)

**GitHub:** https://github.com/miyamoto-labs/easypoly

---

## 🎯 What We Built

EasyPoly is an AI-powered Polymarket analytics platform that uses **Synthdata's probabilistic forecasts** to help retail traders:

1. Find mispriced markets
2. Discover winning traders
3. Copy profitable strategies

---

## 🔌 Synthdata Integration

### 1. Market Analysis

We query Synthdata's Polymarket endpoints to identify edge:

```python
# Hourly BTC Up/Down predictions
response = requests.get(
    "https://api.synthdata.co/insights/polymarket/up-down/hourly",
    headers={"Authorization": f"Apikey {API_KEY}"},
    params={"asset": "BTC"}
)

data = response.json()
synth_prob = data['synth_probability_up']
market_prob = data['polymarket_probability_up']
edge = synth_prob - market_prob

if abs(edge) > 0.05:  # 5% threshold
    # Flag market as mispriced
    create_alpha_signal(market_id, edge)
```

**Endpoints used:**
- `/insights/polymarket/up-down/hourly`
- `/insights/polymarket/up-down/daily`
- `/insights/volatility` (planned)

### 2. Conviction Scoring

We built a multi-signal scoring engine that combines:

- **Synthdata predictions** (40% weight)
- **Volume analysis** (30% weight)
- **Trader behavior** (30% weight)

**Output:** Conviction score (0-100) for each market

**Algorithm:**
```python
def calculate_conviction(market):
    # Synthdata signal
    synthdata_edge = abs(synth_prob - market_prob)
    synthdata_score = min(synthdata_edge * 10, 40)
    
    # Volume signal
    volume_score = analyze_volume(market)  # Max 30 pts
    
    # Trader sentiment
    trader_score = analyze_traders(market)  # Max 30 pts
    
    return synthdata_score + volume_score + trader_score
```

### 3. Trader Discovery

We analyze trader performance on **Synthdata-accurate markets**:

- Find traders who consistently align with Synthdata signals
- Calculate "Synthdata Alpha Correlation" score
- Rank traders by multi-dimensional metrics

**Use case:** Copy traders who have proven ability to spot what Synthdata spots.

---

## 💡 Innovation

### What Makes EasyPoly Unique

**1. Retail-First**
Most Synthdata integrations target quants. We built for everyday traders.

**2. Multi-Signal Intelligence**
Don't just trust one data source — combine Synthdata + volume + trader behavior.

**3. Copy Trading**
Don't just show alpha — let users execute with one click.

**4. AI-Native Development**
Built with AI co-founder (Miyamoto) using autonomous coding agents.

---

## 📊 Business Model

**Freemium SaaS:**

- **Free:** Basic market analysis
- **Pro ($29/mo):** Copy trading, real-time alerts
- **Whale ($99/mo):** Portfolio management, custom strategies

**Target Market:**
- 10K+ monthly active Polymarket traders
- Crypto traders expanding into prediction markets
- Synthdata API users looking for ready-made UI

**Go-to-Market:**
- Beta: 50 curated users (existing network)
- Twitter: @easypoly_lol (autonomous posting)
- Partnerships: Polymarket influencers
- Hackathon exposure

---

## 🚀 What We Built During Hackathon

- ✅ Unified monorepo structure
- ✅ Synthdata API integration (engine)
- ✅ Market analysis dashboard (frontend)
- ✅ Conviction scoring algorithm
- ✅ Trader leaderboard (manual curation)
- ✅ Copy trade UI
- ⏳ Wallet connection (in progress)

---

## 🗺️ Roadmap

**Q2 2026:**
- Automated 6-hour trader scanning
- Real-time push notifications
- Mobile-responsive UI

**Q3 2026:**
- Portfolio optimization
- Advanced risk management
- Social features

**Q4 2026:**
- Mobile app (iOS/Android)
- Institutional tier
- Multi-chain expansion

---

## 🏆 Why We Win

**1. Full-Stack Product**
Not just another bot — complete platform (analysis + discovery + execution).

**2. Proven Founder**
Erik has 3+ years Polymarket experience, multiple profitable bots.

**3. Clear Revenue Model**
Freemium SaaS with large addressable market.

**4. Scalable Architecture**
Monorepo, API-first, modular design.

**5. Community-Ready**
Twitter account, landing page, documentation all ready.

---

## 📞 Contact

**Erik Austheim**
- GitHub: [miyamoto-labs](https://github.com/miyamoto-labs)
- Twitter: [@miyamotolabs](https://twitter.com/miyamotolabs)
- Email: dostoyevskyai@gmail.com

**Project Links:**
- Demo: [app.easypoly.io](https://app.easypoly.io) *(coming soon)*
- Twitter: [@easypoly_lol](https://twitter.com/easypoly_lol)
- Landing: [easypoly.io](https://easypoly.io) *(coming soon)*

---

**Thank you for considering EasyPoly!** 🚀
