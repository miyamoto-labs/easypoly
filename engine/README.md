# EasyPoly Engine

Python AI engine for predictions and trader analysis.

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env
# Add SYNTHDATA_API_KEY, POLYMARKET_API_KEY
python main.py
```

## Structure

```
engine/
├── scanner/      # Synthdata + Polymarket APIs
├── conviction/   # Multi-signal scoring
├── traders/      # Trader discovery & ranking
└── api/          # FastAPI endpoints
```

*Migrate your `easypoly-engine` code here*
