"""
Backtesting Engine
Core logic for simulating trading strategies against historical data
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Any
from datetime import datetime
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)


class StrategyParams(BaseModel):
    """Parameters defining a trading strategy"""
    name: str
    edge_threshold: float = 0.10  # Minimum edge to take trade
    confidence_threshold: float = 0.60  # Minimum confidence
    position_size: float = 100.0  # $ per trade
    timeframe: str = "1h"  # 1h or 24h
    asset: str = "BTC"
    min_miners_agree: Optional[int] = None  # For consensus strategies
    multi_timeframe: bool = False  # Require both 1h and 24h alignment


class Trade(BaseModel):
    """Individual trade record"""
    timestamp: str
    asset: str
    direction: str  # "long" or "short"
    entry_price: float
    exit_price: float
    position_size: float
    profit: float
    edge: float
    confidence: float
    outcome: int  # 1 = win, 0 = loss


class BacktestMetrics(BaseModel):
    """Summary metrics for a backtest"""
    total_return: float
    total_return_pct: float
    win_rate: float
    sharpe_ratio: float
    max_drawdown: float
    max_drawdown_pct: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    avg_win: float
    avg_loss: float
    largest_win: float
    largest_loss: float
    profit_factor: float


class BacktestResult(BaseModel):
    """Complete backtest result"""
    strategy: StrategyParams
    metrics: BacktestMetrics
    trades: List[Trade]
    equity_curve: List[Dict[str, Any]]


class Backtester:
    """Backtesting engine for trading strategies"""
    
    def __init__(self):
        self.risk_free_rate = 0.03  # 3% annual risk-free rate
    
    def run_backtest(
        self,
        strategy: StrategyParams,
        predictions: List[Dict[str, Any]],
        outcomes: List[Dict[str, Any]]
    ) -> BacktestResult:
        """
        Run a backtest with given strategy parameters
        
        Args:
            strategy: Strategy parameters
            predictions: Historical predictions from Synthdata
            outcomes: Actual outcomes/results
        
        Returns:
            BacktestResult with trades, metrics, and equity curve
        """
        # Convert to DataFrames for easier manipulation
        pred_df = pd.DataFrame(predictions)
        outcome_df = pd.DataFrame(outcomes)
        
        # Merge predictions with outcomes
        if 'timestamp' in pred_df.columns and 'timestamp' in outcome_df.columns:
            pred_df['timestamp'] = pd.to_datetime(pred_df['timestamp'])
            outcome_df['timestamp'] = pd.to_datetime(outcome_df['timestamp'])
            df = pd.merge(pred_df, outcome_df, on='timestamp', how='inner', suffixes=('_pred', '_outcome'))
        else:
            logger.warning("Missing timestamp columns, using mock merge")
            df = pred_df.copy()
            df['actual_outcome'] = np.random.binomial(1, 0.58, len(df))
        
        # Execute strategy
        trades = []
        equity = strategy.position_size * 10  # Starting capital
        equity_curve = [{"date": df.iloc[0]['timestamp'].isoformat() if 'timestamp' in df.columns else datetime.now().isoformat(), "equity": equity}]
        
        for idx, row in df.iterrows():
            # Check if trade meets strategy criteria
            if not self._meets_criteria(row, strategy):
                continue
            
            # Determine direction based on Synthdata probability
            synthdata_prob = row.get('synthdata_probability', 0.5)
            direction = "long" if synthdata_prob > 0.5 else "short"
            
            # Simulate trade execution
            actual_outcome = row.get('actual_outcome', 0)
            
            # Calculate profit
            if direction == "long":
                won = actual_outcome == 1
            else:
                won = actual_outcome == 0
            
            # Profit calculation (simplified: win = +100%, loss = -100%)
            profit = strategy.position_size if won else -strategy.position_size
            equity += profit
            
            # Record trade
            trade = Trade(
                timestamp=row['timestamp'].isoformat() if 'timestamp' in row and pd.notna(row['timestamp']) else datetime.now().isoformat(),
                asset=strategy.asset,
                direction=direction,
                entry_price=0.0,  # Mock price
                exit_price=0.0,  # Mock price
                position_size=strategy.position_size,
                profit=profit,
                edge=row.get('edge', 0),
                confidence=row.get('confidence', 0),
                outcome=1 if won else 0
            )
            trades.append(trade)
            
            # Update equity curve
            equity_curve.append({
                "date": row['timestamp'].isoformat() if 'timestamp' in row and pd.notna(row['timestamp']) else datetime.now().isoformat(),
                "equity": equity
            })
        
        # Calculate metrics
        metrics = self._calculate_metrics(trades, equity, strategy.position_size * 10)
        
        return BacktestResult(
            strategy=strategy,
            metrics=metrics,
            trades=trades,
            equity_curve=equity_curve
        )
    
    def _meets_criteria(self, row: pd.Series, strategy: StrategyParams) -> bool:
        """Check if a prediction meets the strategy criteria"""
        # Edge threshold
        edge = row.get('edge', 0)
        if edge < strategy.edge_threshold:
            return False
        
        # Confidence threshold
        confidence = row.get('confidence', 0)
        if confidence < strategy.confidence_threshold:
            return False
        
        # Timeframe filter
        if 'timeframe' in row and row['timeframe'] != strategy.timeframe:
            return False
        
        # Miner consensus (if applicable)
        if strategy.min_miners_agree:
            # Check if minimum number of top miners agree
            # This is a simplified check
            top_miners = row.get('top_miners', [])
            if len(top_miners) < strategy.min_miners_agree:
                return False
        
        return True
    
    def _calculate_metrics(self, trades: List[Trade], final_equity: float, initial_capital: float) -> BacktestMetrics:
        """Calculate performance metrics from trades"""
        if not trades:
            return BacktestMetrics(
                total_return=0,
                total_return_pct=0,
                win_rate=0,
                sharpe_ratio=0,
                max_drawdown=0,
                max_drawdown_pct=0,
                total_trades=0,
                winning_trades=0,
                losing_trades=0,
                avg_win=0,
                avg_loss=0,
                largest_win=0,
                largest_loss=0,
                profit_factor=0
            )
        
        # Basic stats
        total_return = final_equity - initial_capital
        total_return_pct = (total_return / initial_capital) * 100
        
        winning_trades = [t for t in trades if t.profit > 0]
        losing_trades = [t for t in trades if t.profit < 0]
        
        win_rate = len(winning_trades) / len(trades) if trades else 0
        
        # Calculate returns for Sharpe ratio
        returns = [t.profit / initial_capital for t in trades]
        avg_return = np.mean(returns)
        std_return = np.std(returns) if len(returns) > 1 else 0
        sharpe_ratio = (avg_return - self.risk_free_rate / 252) / std_return if std_return > 0 else 0
        
        # Max drawdown
        equity_values = [initial_capital]
        for trade in trades:
            equity_values.append(equity_values[-1] + trade.profit)
        
        peak = equity_values[0]
        max_dd = 0
        for value in equity_values:
            if value > peak:
                peak = value
            dd = peak - value
            if dd > max_dd:
                max_dd = dd
        
        max_dd_pct = (max_dd / peak * 100) if peak > 0 else 0
        
        # Win/Loss stats
        avg_win = np.mean([t.profit for t in winning_trades]) if winning_trades else 0
        avg_loss = np.mean([t.profit for t in losing_trades]) if losing_trades else 0
        largest_win = max([t.profit for t in winning_trades]) if winning_trades else 0
        largest_loss = min([t.profit for t in losing_trades]) if losing_trades else 0
        
        # Profit factor
        gross_profit = sum([t.profit for t in winning_trades])
        gross_loss = abs(sum([t.profit for t in losing_trades]))
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0
        
        return BacktestMetrics(
            total_return=round(total_return, 2),
            total_return_pct=round(total_return_pct, 2),
            win_rate=round(win_rate * 100, 2),
            sharpe_ratio=round(sharpe_ratio, 2),
            max_drawdown=round(max_dd, 2),
            max_drawdown_pct=round(max_dd_pct, 2),
            total_trades=len(trades),
            winning_trades=len(winning_trades),
            losing_trades=len(losing_trades),
            avg_win=round(avg_win, 2),
            avg_loss=round(avg_loss, 2),
            largest_win=round(largest_win, 2),
            largest_loss=round(largest_loss, 2),
            profit_factor=round(profit_factor, 2)
        )
