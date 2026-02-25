"""
Pre-built Trading Strategies
Collection of ready-to-use backtesting strategies inspired by successful traders
"""

from backtester import StrategyParams
from typing import List


def get_all_strategies() -> List[StrategyParams]:
    """Return all available pre-built strategies"""
    return [
        gopfan2_strategy(),
        scalper_strategy(),
        sniper_strategy(),
        diversified_strategy(),
        conservative_strategy(),
        aggressive_strategy()
    ]


def gopfan2_strategy() -> StrategyParams:
    """
    Gopfan2 Strategy - Inspired by the legendary $2M+ Polymarket trader
    
    Strategy: High-edge, high-confidence trades only
    - Only trade when Synthdata has clear edge (>15%)
    - Require high confidence (>75%)
    - Focus on BTC (most liquid, reliable data)
    - 1hr timeframe for more opportunities
    """
    return StrategyParams(
        name="Gopfan2 Strategy",
        edge_threshold=0.15,
        confidence_threshold=0.75,
        position_size=100.0,
        timeframe="1h",
        asset="BTC"
    )


def scalper_strategy() -> StrategyParams:
    """
    Scalper Strategy - High volume, moderate edge
    
    Strategy: Take many small-edge trades
    - Lower edge threshold (10%)
    - Lower confidence (60%)
    - 1hr timeframe for frequency
    - Relies on volume and slight edge
    """
    return StrategyParams(
        name="Scalper",
        edge_threshold=0.10,
        confidence_threshold=0.60,
        position_size=50.0,  # Smaller positions for volume
        timeframe="1h",
        asset="BTC"
    )


def sniper_strategy() -> StrategyParams:
    """
    Sniper Strategy - Wait for perfect setups
    
    Strategy: Only trade when everything aligns
    - Very high edge (>20%)
    - Very high confidence (>85%)
    - Fewer trades, higher win rate
    """
    return StrategyParams(
        name="Sniper",
        edge_threshold=0.20,
        confidence_threshold=0.85,
        position_size=200.0,  # Larger positions on best setups
        timeframe="1h",
        asset="BTC"
    )


def diversified_strategy() -> StrategyParams:
    """
    Diversified Strategy - Multi-asset rotation
    
    Strategy: Spread risk across assets
    - Moderate edge (12%)
    - Good confidence (70%)
    - Rotates between BTC, ETH based on best opportunities
    """
    return StrategyParams(
        name="Diversified",
        edge_threshold=0.12,
        confidence_threshold=0.70,
        position_size=100.0,
        timeframe="1h",
        asset="BTC"  # Primary asset, can extend to multi-asset
    )


def conservative_strategy() -> StrategyParams:
    """
    Conservative Strategy - Capital preservation focus
    
    Strategy: Low risk, steady gains
    - High edge requirement (18%)
    - High confidence (80%)
    - 24hr timeframe for stability
    """
    return StrategyParams(
        name="Conservative",
        edge_threshold=0.18,
        confidence_threshold=0.80,
        position_size=75.0,
        timeframe="24h",
        asset="BTC"
    )


def aggressive_strategy() -> StrategyParams:
    """
    Aggressive Strategy - Maximum opportunity capture
    
    Strategy: Take every reasonable edge
    - Low edge threshold (8%)
    - Moderate confidence (65%)
    - High frequency, high volume
    """
    return StrategyParams(
        name="Aggressive",
        edge_threshold=0.08,
        confidence_threshold=0.65,
        position_size=150.0,
        timeframe="1h",
        asset="BTC"
    )


def get_strategy_by_name(name: str) -> StrategyParams:
    """Get a specific strategy by name"""
    strategies = {s.name: s for s in get_all_strategies()}
    if name not in strategies:
        raise ValueError(f"Strategy '{name}' not found. Available: {list(strategies.keys())}")
    return strategies[name]
