"""
Synthdata API Client
Handles fetching historical predictions and validation scores from Synthdata API
"""

import os
import httpx
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from dateutil import parser
import logging

logger = logging.getLogger(__name__)

class SynthdataClient:
    """Client for interacting with Synthdata API"""
    
    BASE_URL = "https://api.synthdata.co"
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("SYNTHDATA_API_KEY")
        if not self.api_key:
            logger.warning("No Synthdata API key found. Using mock data for development.")
        
        self.headers = {
            "Authorization": f"Bearer {self.api_key}" if self.api_key else "",
            "Content-Type": "application/json"
        }
    
    async def get_historical_predictions(
        self,
        asset: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        timeframe: str = "1h"
    ) -> List[Dict[str, Any]]:
        """
        Fetch historical predictions for an asset
        
        Args:
            asset: Asset symbol (BTC, ETH, SOL, etc.)
            start_time: Start of time range (defaults to 30 days ago)
            end_time: End of time range (defaults to now)
            timeframe: Prediction timeframe (1h, 24h)
        
        Returns:
            List of prediction objects
        """
        if not start_time:
            start_time = datetime.utcnow() - timedelta(days=30)
        if not end_time:
            end_time = datetime.utcnow()
        
        # For development: return mock data if no API key
        if not self.api_key:
            return self._generate_mock_predictions(asset, start_time, end_time, timeframe)
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/v2/prediction/historical",
                    params={
                        "asset": asset,
                        "start_time": start_time.isoformat(),
                        "end_time": end_time.isoformat(),
                        "timeframe": timeframe
                    },
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Error fetching historical predictions: {e}")
            # Fallback to mock data on error
            return self._generate_mock_predictions(asset, start_time, end_time, timeframe)
    
    async def get_validation_scores(
        self,
        asset: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Fetch validation scores (actual outcomes) for historical predictions
        
        Args:
            asset: Asset symbol
            start_time: Start of time range
            end_time: End of time range
        
        Returns:
            List of validation score objects with actual outcomes
        """
        if not start_time:
            start_time = datetime.utcnow() - timedelta(days=30)
        if not end_time:
            end_time = datetime.utcnow()
        
        # For development: return mock data if no API key
        if not self.api_key:
            return self._generate_mock_outcomes(asset, start_time, end_time)
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/validation/scores/historical",
                    params={
                        "asset": asset,
                        "start_time": start_time.isoformat(),
                        "end_time": end_time.isoformat()
                    },
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Error fetching validation scores: {e}")
            # Fallback to mock data on error
            return self._generate_mock_outcomes(asset, start_time, end_time)
    
    def _generate_mock_predictions(
        self,
        asset: str,
        start_time: datetime,
        end_time: datetime,
        timeframe: str
    ) -> List[Dict[str, Any]]:
        """Generate mock prediction data for development"""
        import random
        import numpy as np
        
        predictions = []
        current = start_time
        interval = timedelta(hours=1 if timeframe == "1h" else 24)
        
        while current < end_time:
            # Generate realistic prediction probabilities
            # Synthdata tends to be better calibrated than market
            market_prob = random.uniform(0.45, 0.65)
            # Synthdata has some edge (higher accuracy)
            synthdata_prob = market_prob + random.gauss(0.05, 0.08)
            synthdata_prob = max(0.4, min(0.7, synthdata_prob))
            
            edge = abs(synthdata_prob - market_prob)
            
            predictions.append({
                "timestamp": current.isoformat(),
                "asset": asset,
                "timeframe": timeframe,
                "synthdata_probability": round(synthdata_prob, 4),
                "market_probability": round(market_prob, 4),
                "edge": round(edge, 4),
                "confidence": round(random.uniform(0.6, 0.95), 2),
                "top_miners": [
                    {"miner_id": f"miner_{i}", "probability": round(random.uniform(0.45, 0.65), 4)}
                    for i in range(5)
                ]
            })
            
            current += interval
        
        return predictions
    
    def _generate_mock_outcomes(
        self,
        asset: str,
        start_time: datetime,
        end_time: datetime
    ) -> List[Dict[str, Any]]:
        """Generate mock outcome data for development"""
        import random
        
        outcomes = []
        current = start_time
        
        while current < end_time:
            # Generate outcomes based on realistic win rates
            # Synthdata predictions should win ~55-60% of the time
            actual_outcome = 1 if random.random() < 0.58 else 0
            
            outcomes.append({
                "timestamp": current.isoformat(),
                "asset": asset,
                "actual_outcome": actual_outcome,
                "price_movement": round(random.gauss(0, 0.02), 4)  # ~2% std dev
            })
            
            current += timedelta(hours=1)
        
        return outcomes
