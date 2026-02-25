# Strategy Lab Backend

Backtesting engine for testing trading strategies against historical Synthdata predictions.

## Quick Start

### Setup

```bash
cd engine/strategylab
pip install -r requirements.txt
```

### Environment Variables

Create a `.env` file:

```
SYNTHDATA_API_KEY=your_api_key_here
```

> **Note:** If no API key is provided, the system will use mock data for development.

### Run the Server

```bash
python main.py
```

Server runs on http://localhost:8001

## API Endpoints

### GET /
Health check and API info

### GET /strategies
List all pre-built strategies

**Response:**
```json
{
  "strategies": [
    {
      "name": "Gopfan2 Strategy",
      "edge_threshold": 0.15,
      "confidence_threshold": 0.75,
      "position_size": 100.0,
      "timeframe": "1h",
      "asset": "BTC"
    }
  ]
}
```

### POST /backtest
Run a backtest

**Request:**
```json
{
  "strategy_name": "Gopfan2 Strategy",
  "days_back": 30,
  "asset": "BTC"
}
```

Or with custom parameters:
```json
{
  "custom_params": {
    "name": "My Custom Strategy",
    "edge_threshold": 0.12,
    "confidence_threshold": 0.70,
    "position_size": 100.0,
    "timeframe": "1h",
    "asset": "ETH"
  },
  "days_back": 30
}
```

**Response:**
```json
{
  "strategy": { ... },
  "metrics": {
    "total_return": 850.0,
    "total_return_pct": 85.0,
    "win_rate": 58.5,
    "sharpe_ratio": 1.42,
    "max_drawdown": 150.0,
    "max_drawdown_pct": 12.5,
    "total_trades": 120
  },
  "trades": [ ... ],
  "equity_curve": [ ... ]
}
```

### GET /historical-data/{asset}
Get historical prediction data

**Query Parameters:**
- `days_back` (default: 30)
- `timeframe` (default: "1h")

## Pre-Built Strategies

1. **Gopfan2 Strategy** - High edge, high confidence (>15% edge, >75% confidence)
2. **Scalper** - High volume, moderate edge (>10% edge, >60% confidence)
3. **Sniper** - Perfect setups only (>20% edge, >85% confidence)
4. **Diversified** - Multi-asset rotation (>12% edge, >70% confidence)
5. **Conservative** - Capital preservation (>18% edge, >80% confidence, 24h timeframe)
6. **Aggressive** - Maximum opportunity (>8% edge, >65% confidence)

## Development

### Mock Data

When no Synthdata API key is provided, the system automatically generates realistic mock data for development and testing.

### Testing

```bash
# Test the API
curl http://localhost:8001/strategies

# Run a backtest
curl -X POST http://localhost:8001/backtest \
  -H "Content-Type: application/json" \
  -d '{"strategy_name": "Gopfan2 Strategy", "days_back": 30}'
```

## Deployment

Deploy to Railway:

```bash
# Railway will automatically detect the Procfile
railway up
```

Or run with Gunicorn:

```bash
gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app
```
