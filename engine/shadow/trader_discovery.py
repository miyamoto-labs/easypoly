"""
Trader Discovery Engine — Deep profiling and scoring of Polymarket traders.

Replaces the shallow trader_scanner with a 7-factor scoring system:
1. ROI (25%) — Return on investment via sigmoid scaling
2. Win Rate (20%) — From actual closed positions
3. Consistency (15%) — PnL variability
4. Risk Management (15%) — Position sizing discipline
5. Volume (10%) — Log-scaled trading volume
6. Edge (10%) — Performance above random baseline
7. Recency (5%) — How recently the trader was active

Uses async httpx for concurrent data fetching with built-in rate limiting.
Stores results in ep_tracked_traders for the copy trading engine.
"""
from __future__ import annotations

import asyncio
import json
import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

import httpx

from config import WHALE_WALLETS
from db.queries import TraderQueries, AuditLog
from utils.logger import log

# ─────────────────────────────────────────────────────────────────────
# Constants & Configuration
# ─────────────────────────────────────────────────────────────────────

DATA_API = "https://data-api.polymarket.com"

# Scoring weights (must sum to 1.0)
WEIGHT_ROI = 0.20
WEIGHT_WIN_RATE = 0.20
WEIGHT_CONSISTENCY = 0.15
WEIGHT_RISK_MGMT = 0.15
WEIGHT_VOLUME = 0.05
WEIGHT_EDGE = 0.10
WEIGHT_RECENCY = 0.15

# Minimum thresholds for qualification
MIN_TRADES = 15
MIN_VOLUME_USD = 500
MIN_ACTIVE_DAYS = 5
MIN_RESOLVED_POSITIONS = 5
MIN_DAYS_SINCE_LAST_TRADE = 30

# ─────────────────────────────────────────────────────────────────────
# Category Detection (keyword-based classification from trade titles)
# ─────────────────────────────────────────────────────────────────────
CATEGORY_KEYWORDS = {
    "politics": [
        "election", "president", "congress", "senate", "vote", "biden", "trump",
        "democrat", "republican", "white house", "governor", "mayor", "campaign",
        "political", "legislation", "bill", "law", "policy", "government",
        "supreme court", "impeach", "primary", "nominee", "cabinet",
    ],
    "sports": [
        "nfl", "nba", "mlb", "nhl", "soccer", "football", "basketball", "baseball",
        "hockey", "championship", "playoff", "super bowl", "world series", "finals",
        "mvp", "player", "team", "game", "match", "tournament", "olympics",
        "ufc", "boxing", "tennis", "golf", "f1", "formula 1", "world cup",
    ],
    "crypto": [
        "bitcoin", "btc", "ethereum", "eth", "solana", "sol", "crypto", "coinbase",
        "binance", "blockchain", "defi", "nft", "token", "coin", "wallet", "mining",
        "satoshi", "altcoin", "stablecoin", "usdc", "usdt", "doge", "memecoin",
        "airdrop", "polymarket",
    ],
    "culture": [
        "movie", "film", "actor", "actress", "box office", "oscar", "grammy",
        "emmy", "music", "album", "artist", "celebrity", "pop culture", "tv show",
        "series", "streaming", "netflix", "spotify", "youtube", "influencer",
        "tiktok", "viral", "meme",
    ],
    "finance": [
        "stock", "market", "nasdaq", "s&p", "dow", "trading", "earnings", "ipo",
        "acquisition", "merger", "fed", "interest rate", "inflation", "gdp",
        "unemployment", "bond", "treasury", "recession", "bull market", "bear market",
    ],
    "mentions": [
        "elon musk", "jeff bezos", "mark zuckerberg", "tim cook", "satya nadella",
        "jensen huang", "sam altman", "vitalik buterin", "cz", "sbf",
        "tweet", "post", "follower", "x.com", "twitter",
    ],
}


def classify_market_category(title: str) -> str:
    """Classify a market into a category based on title keywords."""
    text = title.lower()
    scores = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        scores[category] = sum(1 for kw in keywords if kw in text)
    if max(scores.values()) == 0:
        return "other"
    return max(scores, key=scores.get)


def analyze_trader_categories(profile) -> tuple[str, dict, dict]:
    """
    Analyze trader's category distribution from their trade history.
    Returns: (primary_category, category_breakdown_pct, category_counts)
    """
    category_counts: dict[str, int] = {}
    seen_markets: set[str] = set()

    for trade in profile.trades:
        if trade.condition_id in seen_markets:
            continue
        seen_markets.add(trade.condition_id)
        category = classify_market_category(trade.title)
        category_counts[category] = category_counts.get(category, 0) + 1

    if not category_counts:
        return "unknown", {}, {}

    total = sum(category_counts.values())
    category_breakdown = {
        cat: round((count / total) * 100)
        for cat, count in category_counts.items()
    }
    # Prefer non-"unknown" categories as primary
    non_unknown = {k: v for k, v in category_counts.items() if k != "unknown"}
    if non_unknown:
        primary = max(non_unknown, key=non_unknown.get)
    else:
        primary = "unknown"
    return primary, category_breakdown, category_counts


# Rate limiting
MAX_CONCURRENT = 5
REQUEST_DELAY = 0.5  # seconds between requests


class TimePeriod(Enum):
    ALL = "ALL"
    MONTH = "MONTH"
    WEEK = "WEEK"
    DAY = "DAY"


class Category(Enum):
    OVERALL = "OVERALL"
    POLITICS = "POLITICS"
    SPORTS = "SPORTS"
    CRYPTO = "CRYPTO"
    CULTURE = "CULTURE"
    ECONOMICS = "ECONOMICS"
    TECH = "TECH"
    FINANCE = "FINANCE"


# ─────────────────────────────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────────────────────────────

@dataclass
class Trade:
    """A single trade on Polymarket."""
    side: str              # BUY or SELL
    size: float            # token amount
    price: float           # price per token in USDC
    timestamp: int         # unix timestamp
    condition_id: str      # market condition ID
    title: str = ""
    outcome: str = ""      # YES or NO
    asset: str = ""        # token ID

    @property
    def notional(self) -> float:
        return self.size * self.price

    @property
    def dt(self) -> datetime:
        return datetime.fromtimestamp(self.timestamp, tz=timezone.utc)


@dataclass
class Position:
    """A trader's position in a market (open or closed)."""
    condition_id: str
    title: str
    outcome: str           # YES or NO
    size: float            # tokens held
    avg_price: float       # average entry price
    current_price: float   # current market price
    initial_value: float   # USDC spent to enter
    current_value: float   # current mark-to-market
    cash_pnl: float        # realized + unrealized PnL
    pct_pnl: float         # percentage PnL
    is_closed: bool = False
    realized_pnl: float = 0.0


@dataclass
class TraderProfile:
    """Raw data collected from Polymarket APIs for a single trader."""
    address: str
    username: str = ""
    profile_image: str = ""
    leaderboard_rank: int = 0
    leaderboard_pnl: float = 0.0
    leaderboard_volume: float = 0.0
    trades: list[Trade] = field(default_factory=list)
    open_positions: list[Position] = field(default_factory=list)
    closed_positions: list[Position] = field(default_factory=list)
    portfolio_value: float = 0.0


@dataclass
class TraderScore:
    """Computed scores for a trader."""
    address: str
    username: str
    profile_image: str

    # Raw metrics
    total_trades: int = 0
    total_volume: float = 0.0
    total_pnl: float = 0.0
    win_count: int = 0
    loss_count: int = 0
    avg_position_size: float = 0.0
    max_position_size: float = 0.0
    active_days: int = 0
    markets_traded: int = 0
    current_positions: int = 0
    portfolio_value: float = 0.0

    # Computed metrics (0-100 scale)
    roi_score: float = 0.0
    win_rate_score: float = 0.0
    consistency_score: float = 0.0
    risk_mgmt_score: float = 0.0
    volume_score: float = 0.0
    edge_score: float = 0.0
    recency_score: float = 0.0

    # Final composite
    composite_score: float = 0.0
    tier: str = ""  # S, A, B, C, D
    recommendation: str = ""

    # Metadata
    disqualified: bool = False
    disqualify_reason: str = ""
    last_trade_timestamp: int = 0  # Unix timestamp of most recent trade
    primary_category: str = ""
    category_breakdown: dict = field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────────
# API Client
# ─────────────────────────────────────────────────────────────────────

class PolymarketClient:
    """Async client for Polymarket's public Data API."""

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENT)
        self._last_request = 0.0

    async def __aenter__(self):
        self._client = httpx.AsyncClient(
            timeout=30.0,
            headers={"Accept": "application/json"},
        )
        return self

    async def __aexit__(self, *args):
        if self._client:
            await self._client.aclose()

    async def _get(self, url: str, params: dict | None = None) -> dict | list:
        """Rate-limited GET request."""
        async with self._semaphore:
            elapsed = time.monotonic() - self._last_request
            if elapsed < REQUEST_DELAY:
                await asyncio.sleep(REQUEST_DELAY - elapsed)

            resp = await self._client.get(url, params=params)
            self._last_request = time.monotonic()

            if resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", "5"))
                log("warning", f"Rate limited, waiting {retry_after}s...", source="trader_discovery")
                await asyncio.sleep(retry_after)
                return await self._get(url, params)

            resp.raise_for_status()
            return resp.json()

    # --- Leaderboard ---
    async def get_leaderboard(
        self,
        category: Category = Category.OVERALL,
        time_period: TimePeriod = TimePeriod.ALL,
        order_by: str = "PNL",
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        """Fetch top traders from leaderboard."""
        return await self._get(f"{DATA_API}/v1/leaderboard", {
            "category": category.value,
            "timePeriod": time_period.value,
            "orderBy": order_by,
            "limit": limit,
            "offset": offset,
        })

    # --- Trades ---
    async def get_trades(
        self, address: str, limit: int = 500, offset: int = 0
    ) -> list[dict]:
        """Fetch trade history for a user."""
        return await self._get(f"{DATA_API}/trades", {
            "user": address,
            "limit": limit,
            "offset": offset,
        })

    async def get_all_trades(self, address: str, max_trades: int = 10000) -> list[dict]:
        """Paginate through all trades for a user (increased limit for quality data)."""
        all_trades = []
        offset = 0
        batch_size = 500
        while offset < max_trades:
            batch = await self.get_trades(address, limit=batch_size, offset=offset)
            if not batch:
                break
            all_trades.extend(batch)
            if len(batch) < batch_size:
                break
            offset += batch_size
        return all_trades

    # --- Positions ---
    async def get_positions(
        self, address: str, limit: int = 500, offset: int = 0
    ) -> list[dict]:
        """Fetch current open positions."""
        return await self._get(f"{DATA_API}/positions", {
            "user": address,
            "limit": limit,
            "offset": offset,
            "sortBy": "CASHPNL",
            "sortDirection": "DESC",
        })

    async def get_closed_positions(
        self, address: str, limit: int = 50, offset: int = 0
    ) -> list[dict]:
        """Fetch resolved/closed positions (no sort bias — returns wins AND losses)."""
        return await self._get(f"{DATA_API}/closed-positions", {
            "user": address,
            "limit": limit,
            "offset": offset,
        })

    async def get_all_closed_positions(
        self, address: str, max_positions: int = 10000
    ) -> list[dict]:
        """Paginate through closed positions (increased limit for complete data)."""
        all_positions = []
        offset = 0
        batch_size = 50  # API max
        while offset < max_positions:
            batch = await self.get_closed_positions(
                address, limit=batch_size, offset=offset
            )
            if not batch:
                break
            all_positions.extend(batch)
            if len(batch) < batch_size:
                break
            offset += batch_size
        return all_positions

    # --- Portfolio Value ---
    async def get_portfolio_value(self, address: str) -> float:
        """Get total portfolio value."""
        try:
            data = await self._get(f"{DATA_API}/value", {"user": address})
            if data and isinstance(data, list) and len(data) > 0:
                return float(data[0].get("value", 0))
            return 0.0
        except Exception:
            return 0.0

    # --- Activity ---
    async def get_activity(
        self, address: str, limit: int = 500, offset: int = 0
    ) -> list[dict]:
        """Fetch user activity log."""
        return await self._get(f"{DATA_API}/activity", {
            "user": address,
            "limit": limit,
            "offset": offset,
            "sortBy": "TIMESTAMP",
            "sortDirection": "DESC",
        })


# ─────────────────────────────────────────────────────────────────────
# Data Collection
# ─────────────────────────────────────────────────────────────────────

async def collect_trader_profile(
    client: PolymarketClient, address: str, username: str = "",
    profile_image: str = "", rank: int = 0, pnl: float = 0.0, vol: float = 0.0,
) -> TraderProfile:
    """Collect all available data for a single trader."""
    profile = TraderProfile(
        address=address,
        username=username,
        profile_image=profile_image,
        leaderboard_rank=rank,
        leaderboard_pnl=pnl,
        leaderboard_volume=vol,
    )

    # Fetch all data concurrently
    trades_raw, positions_raw, closed_raw, portfolio_val = await asyncio.gather(
        client.get_all_trades(address),
        client.get_positions(address),
        client.get_all_closed_positions(address),
        client.get_portfolio_value(address),
        return_exceptions=True,
    )

    # Parse trades
    if isinstance(trades_raw, list):
        for t in trades_raw:
            try:
                profile.trades.append(Trade(
                    side=t.get("side", ""),
                    size=float(t.get("size", 0)),
                    price=float(t.get("price", 0)),
                    timestamp=int(t.get("timestamp", 0)),
                    condition_id=t.get("conditionId", t.get("market", "")),
                    title=t.get("title", ""),
                    outcome=t.get("outcome", ""),
                    asset=t.get("asset", ""),
                ))
            except (ValueError, TypeError):
                continue

    # Parse open positions
    if isinstance(positions_raw, list):
        for pos in positions_raw:
            try:
                profile.open_positions.append(Position(
                    condition_id=pos.get("conditionId", pos.get("market", "")),
                    title=pos.get("title", ""),
                    outcome=pos.get("outcome", ""),
                    size=float(pos.get("size", 0)),
                    avg_price=float(pos.get("avgPrice", 0)),
                    current_price=float(pos.get("curPrice", pos.get("price", 0))),
                    initial_value=float(pos.get("initialValue", 0)),
                    current_value=float(pos.get("currentValue", 0)),
                    cash_pnl=float(pos.get("cashPnl", 0)),
                    pct_pnl=float(pos.get("percentPnl", 0)),
                ))
            except (ValueError, TypeError):
                continue

    # Parse closed positions
    if isinstance(closed_raw, list):
        for pos in closed_raw:
            try:
                profile.closed_positions.append(Position(
                    condition_id=pos.get("conditionId", pos.get("market", "")),
                    title=pos.get("title", ""),
                    outcome=pos.get("outcome", ""),
                    size=float(pos.get("size", 0)),
                    avg_price=float(pos.get("avgPrice", 0)),
                    current_price=float(pos.get("curPrice", pos.get("price", 0))),
                    initial_value=float(pos.get("initialValue", 0)),
                    current_value=float(pos.get("currentValue", 0)),
                    cash_pnl=float(pos.get("cashPnl", 0)),
                    pct_pnl=float(pos.get("percentPnl", 0)),
                    is_closed=True,
                    realized_pnl=float(pos.get("realizedPnl", 0)),
                ))
            except (ValueError, TypeError):
                continue

    if isinstance(portfolio_val, (int, float)):
        profile.portfolio_value = portfolio_val

    return profile


# ─────────────────────────────────────────────────────────────────────
# Scoring Algorithm
# ─────────────────────────────────────────────────────────────────────

def _sigmoid(x: float, midpoint: float = 0, steepness: float = 1) -> float:
    """Sigmoid function mapped to 0-100 for smooth scoring."""
    try:
        return 100 / (1 + math.exp(-steepness * (x - midpoint)))
    except OverflowError:
        return 0.0 if x < midpoint else 100.0


def _log_scale(x: float, base: float = 10, cap: float = 100) -> float:
    """Logarithmic scaling for diminishing returns (e.g., volume)."""
    if x <= 0:
        return 0.0
    return min(cap, (math.log(x + 1) / math.log(base)) * (cap / 5))


def compute_score(profile: TraderProfile) -> TraderScore:
    """
    Score a trader based on their Polymarket history.
    Returns a TraderScore with individual metrics and composite score.
    """
    score = TraderScore(
        address=profile.address,
        username=profile.username or profile.address[:10] + "...",
        profile_image=profile.profile_image,
    )

    # ── Basic stats ──────────────────────────────────────────────
    score.total_trades = len(profile.trades)
    score.total_volume = sum(t.notional for t in profile.trades)
    score.current_positions = len(profile.open_positions)
    score.portfolio_value = profile.portfolio_value

    # Unique markets traded
    market_ids = set(t.condition_id for t in profile.trades)
    score.markets_traded = len(market_ids)

    # Active days
    if profile.trades:
        trade_days = set(t.dt.date() for t in profile.trades)
        score.active_days = len(trade_days)

    # ── Disqualification checks ──────────────────────────────────
    if score.total_trades < MIN_TRADES:
        score.disqualified = True
        score.disqualify_reason = f"Too few trades ({score.total_trades} < {MIN_TRADES})"
        return score

    if score.total_volume < MIN_VOLUME_USD:
        score.disqualified = True
        score.disqualify_reason = f"Volume too low (${score.total_volume:.0f} < ${MIN_VOLUME_USD})"
        return score

    if score.active_days < MIN_ACTIVE_DAYS:
        score.disqualified = True
        score.disqualify_reason = f"Not active enough ({score.active_days} days < {MIN_ACTIVE_DAYS})"
        return score

    # ── Inactivity hard cutoff (30 days) ──────────────────────────
    if profile.trades:
        latest_trade_ts = max(t.timestamp for t in profile.trades)
        days_since_last_trade = (int(time.time()) - latest_trade_ts) / 86400
        score.last_trade_timestamp = latest_trade_ts  # store for DB persistence
        if days_since_last_trade > MIN_DAYS_SINCE_LAST_TRADE:
            score.disqualified = True
            score.disqualify_reason = f"Inactive ({days_since_last_trade:.0f} days since last trade)"
            return score

    # ── Win/Loss from closed positions ───────────────────────────
    for pos in profile.closed_positions:
        if pos.realized_pnl > 0:
            score.win_count += 1
        elif pos.realized_pnl < 0:
            score.loss_count += 1

    total_resolved = score.win_count + score.loss_count

    if total_resolved < MIN_RESOLVED_POSITIONS:
        score.disqualified = True
        score.disqualify_reason = (
            f"Not enough resolved positions ({total_resolved} < {MIN_RESOLVED_POSITIONS})"
        )
        return score

    # ── DATA QUALITY CHECKS ────────────────────────────────────────
    # Filter out suspicious/incomplete data that indicates API issues
    win_rate_pct = (score.win_count / total_resolved * 100) if total_resolved > 0 else 0
    
    # Flag 1: Suspiciously high win rate (likely incomplete data)
    if win_rate_pct >= 95.0 and total_resolved >= 20:
        score.disqualified = True
        score.disqualify_reason = f"Suspicious win rate ({win_rate_pct:.1f}% - likely incomplete API data)"
        return score
    
    # Flag 2: Exactly at API pagination limits (incomplete data)
    if score.total_trades >= 9999:  # Close to our 10k limit
        score.disqualified = True
        score.disqualify_reason = f"Trade count at API limit ({score.total_trades}) - incomplete data"
        return score
    
    # Flag 3: Win rate with zero losses (but many trades)
    if score.loss_count == 0 and total_resolved >= 10:
        score.disqualified = True
        score.disqualify_reason = f"Zero losses in {total_resolved} trades - likely API filtering issue"
        return score

    # ── PnL calculation ──────────────────────────────────────────
    realized_pnl = sum(p.realized_pnl for p in profile.closed_positions)
    unrealized_pnl = sum(p.cash_pnl for p in profile.open_positions)
    score.total_pnl = realized_pnl + unrealized_pnl

    # ── Position sizing stats ────────────────────────────────────
    position_sizes = [p.initial_value for p in profile.closed_positions if p.initial_value > 0]
    position_sizes += [p.initial_value for p in profile.open_positions if p.initial_value > 0]
    if position_sizes:
        score.avg_position_size = sum(position_sizes) / len(position_sizes)
        score.max_position_size = max(position_sizes)

    # ── Category classification ─────────────────────────────────
    primary_cat, cat_breakdown, _ = analyze_trader_categories(profile)
    score.primary_category = primary_cat
    score.category_breakdown = cat_breakdown

    # ╔═══════════════════════════════════════════════════════════════╗
    # ║                    SEVEN SCORING FACTORS                      ║
    # ╚═══════════════════════════════════════════════════════════════╝

    # 1. ROI Score (25% weight)
    if score.total_volume > 0:
        roi_pct = (score.total_pnl / score.total_volume) * 100
        score.roi_score = _sigmoid(roi_pct, midpoint=0, steepness=0.15)
    else:
        score.roi_score = 50.0  # neutral

    # 2. Win Rate Score (20% weight)
    win_rate = score.win_count / total_resolved
    if total_resolved >= 5:
        score.win_rate_score = _sigmoid((win_rate - 0.5) * 200, midpoint=0, steepness=0.1)
    else:
        score.win_rate_score = 50.0  # insufficient data

    # 3. Consistency Score (15% weight)
    individual_returns = []
    for t in profile.trades:
        if t.notional != 0:
            individual_returns.append(t.price)
    if len(individual_returns) >= 5:
        returns_std = (sum((x - 0.5) ** 2 for x in individual_returns) / len(individual_returns)) ** 0.5
        score.consistency_score = _sigmoid(returns_std * -100, midpoint=0, steepness=0.1)
    else:
        score.consistency_score = 50.0

    # 4. Risk Management Score (15% weight)
    if score.avg_position_size > 0 and score.max_position_size > 0:
        position_ratio = score.max_position_size / score.avg_position_size
        score.risk_mgmt_score = _sigmoid(position_ratio * -10, midpoint=3, steepness=0.2)
    else:
        score.risk_mgmt_score = 50.0

    # 5. Volume Score (10% weight)
    score.volume_score = _log_scale(score.total_volume, base=10, cap=100)

    # 6. Edge Score (10% weight)
    if total_resolved >= 5:
        edge = win_rate - 0.5  # 0.5 = random
        score.edge_score = _sigmoid(edge * 100, midpoint=0, steepness=0.08)
    else:
        score.edge_score = 30.0

    # 7. Recency Score (15% weight)
    if profile.trades:
        latest_trade = max(t.timestamp for t in profile.trades)
        score.last_trade_timestamp = latest_trade  # persist for DB
        now = int(time.time())
        days_since_last_trade = (now - latest_trade) / 86400
        if days_since_last_trade <= 1:
            score.recency_score = 100
        elif days_since_last_trade <= 7:
            score.recency_score = 85
        elif days_since_last_trade <= 30:
            score.recency_score = 60
        elif days_since_last_trade <= 90:
            score.recency_score = 30
        else:
            score.recency_score = 10
    else:
        score.recency_score = 0

    # ═══════════════════════════════════════════════════════════════
    # COMPOSITE SCORE
    # ═══════════════════════════════════════════════════════════════
    score.composite_score = (
        WEIGHT_ROI * score.roi_score
        + WEIGHT_WIN_RATE * score.win_rate_score
        + WEIGHT_CONSISTENCY * score.consistency_score
        + WEIGHT_RISK_MGMT * score.risk_mgmt_score
        + WEIGHT_VOLUME * score.volume_score
        + WEIGHT_EDGE * score.edge_score
        + WEIGHT_RECENCY * score.recency_score
    )

    # ── Tier Assignment ───────────────────────
    if score.composite_score >= 80:
        score.tier = "S"
        score.recommendation = "Elite trader. Strong copy candidate."
    elif score.composite_score >= 65:
        score.tier = "A"
        score.recommendation = "High-quality trader. Worth following closely."
    elif score.composite_score >= 50:
        score.tier = "B"
        score.recommendation = "Decent trader. Monitor before copying."
    elif score.composite_score >= 35:
        score.tier = "C"
        score.recommendation = "Below average. Proceed with caution."
    else:
        score.tier = "D"
        score.recommendation = "Weak track record. Not recommended."

    return score


# ─────────────────────────────────────────────────────────────────────
# TraderDiscovery — Main Engine Integration
# ─────────────────────────────────────────────────────────────────────

class TraderDiscovery:
    """
    Deep trader discovery engine.

    Replaces TraderScanner with full trade history analysis and 7-factor scoring.
    Interface: scan_all() returns list[dict] compatible with TraderQueries.upsert_trader().
    """

    def __init__(
        self,
        top_n: int = 50,
        categories: list[Category] | None = None,
        time_periods: list[TimePeriod] | None = None,
    ):
        self.top_n = top_n
        self.categories = categories or [Category.OVERALL]
        self.time_periods = time_periods or [TimePeriod.ALL, TimePeriod.MONTH]

    async def scan_all(self) -> list[dict]:
        """
        Full discovery pipeline:
        1. Pull traders from leaderboard (multiple categories/periods)
        2. Fetch full trade history for each
        3. Score with 7-factor algorithm
        4. Merge seed whales
        5. Upsert all to ep_tracked_traders

        Returns list of trader dicts (DB-compatible format).
        """
        log("info", "Starting deep trader discovery...", source="trader_discovery")

        # Run the async discovery pipeline
        scored = await self._discover_traders()

        # Add seed whales (always included regardless of leaderboard)
        seed_traders = self._seed_whales()
        log("info", f"Adding {len(seed_traders)} seed whales", source="trader_discovery")

        # Convert scored traders to DB-compatible dicts
        all_traders: dict[str, dict] = {}

        for s in scored:
            trader_dict = self._score_to_dict(s)
            all_traders[trader_dict["wallet_address"]] = trader_dict

        # Merge seed whales (don't overwrite scored traders)
        for t in seed_traders:
            addr = t["wallet_address"]
            if addr not in all_traders:
                all_traders[addr] = t

        traders_list = list(all_traders.values())

        # Sort by composite_rank descending
        traders_list.sort(key=lambda t: t.get("composite_rank", 0), reverse=True)

        # NOTE: We do NOT deactivate existing traders - we ACCUMULATE good traders over time
        # Each scan ADDS new discoveries to the existing database
        log("info", "Upserting discovered traders (keeping existing active traders)",
            source="trader_discovery")

        # Upsert to DB (sets active=True for discovered traders)
        saved = 0
        for t in traders_list:
            try:
                TraderQueries.upsert_trader(t)
                saved += 1
            except Exception as e:
                log("warning", f"Failed to upsert trader {t.get('alias', '?')}: {e}",
                    source="trader_discovery")

        # Audit log
        qualified_count = len(scored)
        log("info",
            f"Discovery complete: {qualified_count} qualified traders + {len(seed_traders)} whales, "
            f"saved {saved} to DB",
            source="trader_discovery", audit=True)

        AuditLog.log("trader_discovery", {
            "total_saved": saved,
            "qualified_from_leaderboard": qualified_count,
            "seed_whales": len(seed_traders),
            "tiers": {
                "S": sum(1 for s in scored if s.tier == "S"),
                "A": sum(1 for s in scored if s.tier == "A"),
                "B": sum(1 for s in scored if s.tier == "B"),
                "C": sum(1 for s in scored if s.tier == "C"),
                "D": sum(1 for s in scored if s.tier == "D"),
            },
        }, source="trader_discovery")

        return traders_list

    async def _discover_traders(self) -> list[TraderScore]:
        """
        Core async pipeline:
        1. Fetch leaderboard candidates
        2. Collect full profiles
        3. Score and filter
        """
        async with PolymarketClient() as client:
            # Step 1: Collect candidate addresses from leaderboard
            log("info", "Fetching leaderboard candidates...", source="trader_discovery")
            candidates: dict[str, dict] = {}  # address -> best entry

            for cat in self.categories:
                for period in self.time_periods:
                    for order_by in ["PNL", "VOL"]:
                        try:
                            entries = await client.get_leaderboard(
                                category=cat,
                                time_period=period,
                                order_by=order_by,
                                limit=min(self.top_n, 50),
                            )
                            for entry in entries:
                                addr = entry.get("proxyWallet", "")
                                if not addr:
                                    continue
                                # Keep the entry with highest PnL
                                if addr not in candidates or float(entry.get("pnl", 0)) > candidates[addr].get("pnl", 0):
                                    candidates[addr] = {
                                        "address": addr,
                                        "username": entry.get("userName", ""),
                                        "profile_image": entry.get("profileImage", ""),
                                        "rank": int(entry.get("rank", 0)),
                                        "pnl": float(entry.get("pnl", 0)),
                                        "vol": float(entry.get("vol", 0)),
                                    }
                            log("debug",
                                f"Leaderboard {cat.value}/{period.value}/{order_by}: {len(entries)} traders",
                                source="trader_discovery")
                        except Exception as e:
                            log("warning",
                                f"Leaderboard fetch failed {cat.value}/{period.value}/{order_by}: {e}",
                                source="trader_discovery")

            log("info", f"{len(candidates)} unique candidates found, fetching profiles...",
                source="trader_discovery")

            # Step 2: Collect full profiles (batched by semaphore)
            profiles: list[TraderProfile] = []
            candidate_list = list(candidates.values())

            for i, cand in enumerate(candidate_list):
                try:
                    profile = await collect_trader_profile(
                        client,
                        address=cand["address"],
                        username=cand["username"],
                        profile_image=cand["profile_image"],
                        rank=cand["rank"],
                        pnl=cand["pnl"],
                        vol=cand["vol"],
                    )
                    profiles.append(profile)
                    if (i + 1) % 10 == 0:
                        log("debug", f"Profiled {i + 1}/{len(candidate_list)} traders",
                            source="trader_discovery")
                except Exception as e:
                    log("warning",
                        f"Failed to profile {cand.get('username', cand['address'][:12])}: {e}",
                        source="trader_discovery")

            # Step 3: Score all traders
            log("info", f"Scoring {len(profiles)} traders...", source="trader_discovery")
            scores: list[TraderScore] = []

            for profile in profiles:
                score = compute_score(profile)
                scores.append(score)

                if not score.disqualified:
                    log("debug",
                        f"Scored {score.username}: {score.composite_score:.1f} (Tier {score.tier})",
                        source="trader_discovery")
                else:
                    log("debug",
                        f"Disqualified {score.username}: {score.disqualify_reason}",
                        source="trader_discovery")

            # Step 4: Filter and rank
            qualified = [s for s in scores if not s.disqualified]
            qualified.sort(key=lambda s: s.composite_score, reverse=True)

            disqualified_count = len(scores) - len(qualified)
            log("info",
                f"{len(qualified)} qualified traders (disqualified {disqualified_count})",
                source="trader_discovery")

            return qualified

    @staticmethod
    def _score_to_dict(score: TraderScore) -> dict:
        """Convert TraderScore to dict compatible with TraderQueries.upsert_trader()."""
        total_resolved = score.win_count + score.loss_count
        win_rate = (score.win_count / total_resolved * 100) if total_resolved > 0 else 0

        # Compute ROI percentage
        roi_pct = (score.total_pnl / score.total_volume * 100) if score.total_volume > 0 else 0

        # Derive bankroll tier from total volume
        if score.total_volume >= 500_000:
            bankroll_tier = "whale"
        elif score.total_volume >= 50_000:
            bankroll_tier = "mid"
        elif score.total_volume >= 5_000:
            bankroll_tier = "small"
        else:
            bankroll_tier = "micro"

        # Derive trading style from behavior patterns
        if total_resolved > 0 and win_rate >= 75 and score.total_trades < 50:
            trading_style = "sniper"
        elif score.total_trades >= 200:
            trading_style = "grinder"
        elif score.total_volume >= 500_000:
            trading_style = "whale"
        elif score.avg_position_size > 0 and score.max_position_size / max(score.avg_position_size, 1) > 5:
            trading_style = "degen"
        else:
            trading_style = "unknown"

        return {
            "wallet_address": score.address.lower(),
            "alias": score.username,
            "total_pnl": score.total_pnl,
            "pnl_30d": 0,  # Not tracked per-period in deep scan
            "pnl_7d": 0,
            "win_rate": win_rate,
            "trade_count": score.total_trades,
            "avg_position_size": score.avg_position_size,
            "market_categories": [c for c in score.category_breakdown.keys() if c != "other"],
            "category": score.primary_category if score.primary_category not in ("unknown", "other") else None,
            "active": True,
            # composite_rank on 0-1 scale for DB compatibility with CopyDetector
            "composite_rank": round(score.composite_score / 100, 4),
            "roi": round(roi_pct, 2),
            "bankroll_tier": bankroll_tier,
            "trading_style": trading_style,
            "estimated_bankroll": round(score.total_volume, 2),
            "markets_traded": score.markets_traded,
            "consistency_score": round(score.consistency_score, 2),
            "profile_summary": (
                f"Tier {score.tier} | Score {score.composite_score:.0f}/100 | "
                f"{score.recommendation} | "
                f"WR {win_rate:.0f}% ({score.win_count}W/{score.loss_count}L) | "
                f"PnL ${score.total_pnl:,.0f} | {score.total_trades} trades"
            ),
            "last_trade_date": (
                datetime.utcfromtimestamp(score.last_trade_timestamp).isoformat() + "+00:00"
                if score.last_trade_timestamp > 0 else None
            ),
        }

    @staticmethod
    def _seed_whales() -> list[dict]:
        """Seed whales from config, matching upsert_trader() schema."""
        traders = []
        for name, config in WHALE_WALLETS.items():
            traders.append({
                "wallet_address": config["address"].lower(),
                "alias": name,
                "total_pnl": float(config.get("profit", 0)),
                "pnl_30d": 0,
                "pnl_7d": 0,
                "win_rate": 0,
                "trade_count": 0,
                "avg_position_size": float(config.get("min_position_usd", 0)),
                "market_categories": [config.get("specialty", "general")],
                "profile_summary": f"Known whale - specialty: {config.get('specialty', 'general')}",
                "active": True,
                "composite_rank": 0.5,  # Default rank for seed whales
            })
        return traders
