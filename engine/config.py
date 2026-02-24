"""
Configuration for EasyPoly (Polymarket Superbot)
Central config — reads secrets from .env, never hardcoded.
"""

import os
from typing import Dict, Any
from dotenv import load_dotenv

load_dotenv(override=True)

# ============================================================================
# WALLET & EXECUTION
# ============================================================================

WALLET_ADDRESS = os.environ.get("POLYMARKET_WALLET_ADDRESS", "")
PRIVATE_KEY = os.environ.get("POLYMARKET_PRIVATE_KEY", "")

# Trading mode
PAPER_MODE = os.environ.get("PAPER_MODE", "true").lower() == "true"
MAX_DAILY_LOSS_PCT = 10.0
MAX_POSITION_SIZE_PCT = 20.0

# Capital allocation
STARTING_CAPITAL = 100.0
LIVE_CAPITAL = 5000.0

# ============================================================================
# API ENDPOINTS
# ============================================================================

CLOB_HOST = "https://clob.polymarket.com"
GAMMA_API = "https://gamma-api.polymarket.com"
CHAIN_ID = 137  # Polygon mainnet

# ============================================================================
# TRADER DISCOVERY CONFIG
# ============================================================================
TRADER_DISCOVERY_CONFIG = {
    "top_per_tier": 5,
    "min_position_value": 10,
}

# ============================================================================
# API KEYS (from .env)
# ============================================================================

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
PERPLEXITY_API_KEY = os.environ.get("PERPLEXITY_API_KEY", "")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_ADMIN_CHAT_ID = os.environ.get("TELEGRAM_ADMIN_CHAT_ID", "")

# EasyPoly Bot API (production @EasyPolyBot on Railway)
EASYPOLY_BOT_URL = os.environ.get("EASYPOLY_BOT_URL", "https://easypoly-bot-production.up.railway.app")
EASYPOLY_BOT_API_SECRET = os.environ.get("EASYPOLY_BOT_API_SECRET", "easypoly-2026")

# ============================================================================
# SUPABASE
# ============================================================================

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# ============================================================================
# STRATEGY WEIGHTS
# ============================================================================

STRATEGY_WEIGHTS = {
    "llm_forecast": 0.40,      # 40% - LLM probability forecasting
    "whale_copy": 0.30,        # 30% - Copy whale trades
    "low_risk_bond": 0.20,     # 20% - Near-certain outcomes
    "news_scalp": 0.10         # 10% - Breaking news reactions
}

# ============================================================================
# CONVICTION ENGINE CONFIG (The Analyst — Pillar 1)
# ============================================================================

CONVICTION_CONFIG = {
    "model": "claude-sonnet-4-5-20250929",  # Claude Sonnet 4 for analysis
    "min_conviction_score": 65,              # Only send picks scoring 65+
    "min_risk_reward": 1.2,                  # Minimum 1.2:1 R/R
    "min_confidence_factors": 2,             # At least 2 supporting reasons
    "min_risk_factors": 1,                   # At least 1 identified risk
    "scan_interval_minutes": 360,            # Scan for new opportunities every 6 hours
}

# ============================================================================
# LLM FORECASTING CONFIG
# ============================================================================

LLM_CONFIG = {
    "model": "claude-sonnet-4-5-20250929",
    "min_edge": 0.05,
    "min_confidence": "MEDIUM",
    "news_sources": [
        "coindesk.com",
        "theblock.co",
        "decrypt.co",
        "reuters.com",
        "bloomberg.com",
        "apnews.com"
    ],
    "max_news_age_hours": 24,
    "twitter_monitoring": True,
    "reddit_monitoring": True
}

# ============================================================================
# PERPLEXITY CONFIG (real-time news research)
# ============================================================================

PERPLEXITY_CONFIG = {
    "model": "sonar-pro",
    "max_tokens": 1024,
    "search_recency_filter": "day",  # Only recent results
}

# ============================================================================
# WHALE COPY CONFIG
# ============================================================================

WHALE_WALLETS = {
    "ImJustKen": {
        "address": "0x9d84ce0306f8551e02efef1680475fc0f1dc1344",
        "profit": 2400000,
        "specialty": "politics",
        "min_position_usd": 5000
    },
    "fengdubiying": {
        "address": "0x17db3fcd93ba12d38382a0cade24b200185c5f6d",
        "profit": 2900000,
        "specialty": "esports",
        "min_position_usd": 3000
    },
    "Walrus": {
        "address": "0xfde62dd29574bab38f9f3e4f1da3c1b98c67dfb8",
        "profit": 1300000,
        "specialty": "crypto",
        "min_position_usd": 2000
    },
    "Domer": {
        "address": "0x7bce56c30bb2e09c33ed0b4a68a5c0b6e8c6dc97",
        "profit": 1200000,
        "specialty": "politics",
        "min_position_usd": 2000
    },
    "Fredi9999": {
        "address": "0x3b90fb6b60c8e8f57f9e0a8d35fe4f7c30c07e91",
        "profit": 600000,
        "specialty": "general",
        "min_position_usd": 1000
    }
}

WHALE_COPY_CONFIG = {
    "position_size_pct": 15,
    "delay_seconds": 30,
    "max_copies_per_day": 5,
    "min_whale_conviction": 5000
}

# ============================================================================
# LOW-RISK BOND CONFIG
# ============================================================================

BOND_CONFIG = {
    "min_probability": 0.95,
    "max_price": 0.96,
    "max_time_to_resolution_hours": 72,
    "min_liquidity_usd": 10000,
    "max_position_pct": 20,
    "min_positions": 5,
    "target_return_pct": 3.0
}

# ============================================================================
# NEWS SCALPING CONFIG
# ============================================================================

NEWS_CONFIG = {
    "sources": [
        "https://twitter.com/wublockchain",
        "https://twitter.com/zerohedge",
        "https://twitter.com/degen_gambler",
        "https://www.reddit.com/r/cryptocurrency/new/",
        "https://cryptopanic.com/api/v1/posts/"
    ],
    "keywords_crypto": [
        "hack", "exploit", "sec", "regulation",
        "exchange", "binance", "coinbase", "ftx"
    ],
    "keywords_politics": [
        "resign", "fired", "appointed", "indicted",
        "announcement", "breaking"
    ],
    "reaction_time_seconds": 30,
    "min_edge": 0.10,
    "max_positions": 3
}

# ============================================================================
# RISK MANAGEMENT
# ============================================================================

RISK_LIMITS = {
    "max_position_size_usd": 20.0,
    "max_daily_trades": 20,
    "max_daily_loss_usd": 10.0,
    "max_correlated_positions": 3,
    "require_liquidity_check": True,
    "min_exit_liquidity_usd": 1000
}

# ============================================================================
# LEARNING & ADAPTATION
# ============================================================================

LEARNING_CONFIG = {
    "track_all_predictions": True,
    "update_weights_daily": True,
    "min_trades_before_adjustment": 20,
    "strategy_kill_threshold": -0.15,
    "calibration_window_days": 7
}

# ============================================================================
# MONITORING & LOGGING
# ============================================================================

LOGGING_CONFIG = {
    "log_level": "INFO",
    "log_file": "data/superbot.log",
    "save_all_predictions": True,
    "save_orderbook_snapshots": True,
    "enable_telegram_alerts": True,
    "alert_on_trade": True,
    "alert_on_error": True
}

# ============================================================================
# DATA PATHS
# ============================================================================

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
WHALE_WALLETS_FILE = os.path.join(DATA_DIR, "whale_wallets.json")
MARKET_HISTORY_FILE = os.path.join(DATA_DIR, "market_history.json")
LEARNED_PARAMS_FILE = os.path.join(DATA_DIR, "learned_params.json")
POSITIONS_FILE = os.path.join(DATA_DIR, "active_positions.json")

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def get_capital() -> float:
    """Get current trading capital based on mode"""
    return STARTING_CAPITAL if PAPER_MODE else LIVE_CAPITAL

def get_max_position_size() -> float:
    """Calculate max position size"""
    capital = get_capital()
    return min(
        capital * (MAX_POSITION_SIZE_PCT / 100),
        RISK_LIMITS["max_position_size_usd"]
    )

def get_strategy_allocation(strategy_name: str) -> float:
    """Get capital allocation for a strategy"""
    weight = STRATEGY_WEIGHTS.get(strategy_name, 0.0)
    return get_capital() * weight

# ============================================================================
# EXPORT ALL
# ============================================================================

__all__ = [
    "WALLET_ADDRESS", "PRIVATE_KEY", "PAPER_MODE",
    "CLOB_HOST", "GAMMA_API",
    "ANTHROPIC_API_KEY", "PERPLEXITY_API_KEY",
    "TELEGRAM_BOT_TOKEN", "TELEGRAM_ADMIN_CHAT_ID",
    "EASYPOLY_BOT_URL", "EASYPOLY_BOT_API_SECRET",
    "SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_SERVICE_KEY",
    "STRATEGY_WEIGHTS", "CONVICTION_CONFIG",
    "LLM_CONFIG", "PERPLEXITY_CONFIG",
    "WHALE_WALLETS", "WHALE_COPY_CONFIG",
    "BOND_CONFIG", "NEWS_CONFIG",
    "RISK_LIMITS", "LEARNING_CONFIG", "LOGGING_CONFIG",
    "TRADER_DISCOVERY_CONFIG",
    "get_capital", "get_max_position_size", "get_strategy_allocation"
]
