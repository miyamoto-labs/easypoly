"""
Strategy Lab API
FastAPI backend for backtesting trading strategies
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import logging

from synthdata_client import SynthdataClient
from backtester import Backtester, StrategyParams, BacktestResult
from strategies import get_all_strategies, get_strategy_by_name

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Strategy Lab API",
    description="Backtest trading strategies against historical Synthdata predictions",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize clients
synthdata_client = SynthdataClient()
backtester = Backtester()


class BacktestRequest(BaseModel):
    """Request model for running a backtest"""
    strategy_name: Optional[str] = None
    custom_params: Optional[StrategyParams] = None
    days_back: int = 30
    asset: str = "BTC"


class StrategyListResponse(BaseModel):
    """Response model for strategy list"""
    strategies: List[StrategyParams]


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "Strategy Lab API",
        "version": "1.0.0",
        "endpoints": {
            "backtest": "POST /backtest",
            "strategies": "GET /strategies",
            "historical_data": "GET /historical-data/{asset}"
        }
    }


@app.get("/strategies", response_model=StrategyListResponse)
async def list_strategies():
    """List all available pre-built strategies"""
    try:
        strategies = get_all_strategies()
        return StrategyListResponse(strategies=strategies)
    except Exception as e:
        logger.error(f"Error listing strategies: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/backtest", response_model=BacktestResult)
async def run_backtest(request: BacktestRequest):
    """
    Run a backtest with specified strategy parameters
    
    Either provide strategy_name (pre-built) or custom_params (custom strategy)
    """
    try:
        # Determine strategy to use
        if request.strategy_name:
            strategy = get_strategy_by_name(request.strategy_name)
            # Override asset if specified
            if request.asset != "BTC":
                strategy.asset = request.asset
        elif request.custom_params:
            strategy = request.custom_params
        else:
            raise HTTPException(status_code=400, detail="Must provide either strategy_name or custom_params")
        
        # Calculate time range
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(days=request.days_back)
        
        logger.info(f"Running backtest for {strategy.name} on {strategy.asset} ({request.days_back} days)")
        
        # Fetch historical data
        predictions = await synthdata_client.get_historical_predictions(
            asset=strategy.asset,
            start_time=start_time,
            end_time=end_time,
            timeframe=strategy.timeframe
        )
        
        outcomes = await synthdata_client.get_validation_scores(
            asset=strategy.asset,
            start_time=start_time,
            end_time=end_time
        )
        
        logger.info(f"Fetched {len(predictions)} predictions and {len(outcomes)} outcomes")
        
        # Run backtest
        result = backtester.run_backtest(strategy, predictions, outcomes)
        
        logger.info(f"Backtest complete: {result.metrics.total_trades} trades, {result.metrics.win_rate}% win rate")
        
        return result
    
    except Exception as e:
        logger.error(f"Error running backtest: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/historical-data/{asset}")
async def get_historical_data(
    asset: str,
    days_back: int = 30,
    timeframe: str = "1h"
):
    """
    Get cached historical prediction data for an asset
    
    Useful for frontend visualization without running a full backtest
    """
    try:
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(days=days_back)
        
        predictions = await synthdata_client.get_historical_predictions(
            asset=asset,
            start_time=start_time,
            end_time=end_time,
            timeframe=timeframe
        )
        
        return {
            "asset": asset,
            "timeframe": timeframe,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "predictions": predictions[:100]  # Limit to 100 for preview
        }
    
    except Exception as e:
        logger.error(f"Error fetching historical data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
