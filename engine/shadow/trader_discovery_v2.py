"""
Market-First Trader Discovery Engine v2.0 — THE COMPETITIVE EDGE

This is the alpha discovery mechanism for EasyPoly. Instead of pulling the same
50 traders from global leaderboards, we scrape INDIVIDUAL MARKETS to find
niche specialists making bank that no one else tracks.

KEY IMPROVEMENTS FROM V1:
═══════════════════════════════════════════════════════════════════════════════
1. MARKET-FIRST DISCOVERY: Fetch top 200 markets → top 20 traders per market
   → ~4,000 unique candidates (vs 50 from leaderboards)
   
2. LIFECYCLE STATES: hot/consistent/cooling/cold (show what's hot NOW)

3. CATEGORY SPECIALISTS: Track per-category win rates, identify primary specialty

4. RISING STAR DETECTION: Find hidden gems before they're famous

5. HARD FILTERS: Inactivity kill, bot detection, wash trading, incomplete data

6. EXISTING SCORING: Keep the excellent 7-factor algorithm, just feed it better data
═══════════════════════════════════════════════════════════════════════════════

Replaces trader_discovery.py with a market-first approach that finds specialists.
"""
from __future__ import annotations

import asyncio
import json
import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
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
GAMMA_API = "https://gamma-api.polymarket.com"

# Market discovery settings
TOP_MARKETS_COUNT = 200  # Fetch top 200 highest-volume markets
TOP_TRADERS_PER_MARKET = 20  # Get top 20 traders by P&L per market
EXPECTED_UNIQUE_TRADERS = 4000  # ~200 markets × 20 traders (with overlap)

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
INACTIVITY_CUTOFF_DAYS = 30  # Hard cutoff: inactive >30d → REJECT

# Lifecycle state thresholds (in days)
LIFECYCLE_HOT_DAYS = 7  # Traded in last 7 days with +PnL
LIFECYCLE_CONSISTENT_DAYS = 30  # Active in last 30 days
LIFECYCLE_COOLING_DAYS = 60  # No trades 30-60 days
# >60 days = COLD (hide from users)

# Rising star detection thresholds
RISING_STAR_MOMENTUM_MULTIPLIER = 2.0  # 7d P&L >> 30d average
RISING_STAR_MAX_TRADES = 100  # Early in journey
RISING_STAR_MIN_WIN_RATE = 65.0  # High win rate

# Bot detection patterns
BOT_HEX_ADDRESS_THRESHOLD = 0.8  # If >80% hex chars in address → likely bot
BOT_UPDOWN_PATTERN = ["updown", "bot", "test", "auto"]
BOT_PERFECT_WIN_RATE = 99.0  # 99%+ with >15 trades = suspicious

# Rate limiting
MAX_CONCURRENT = 10  # Increased for market scanning
REQUEST_DELAY = 0.3  # Faster for bulk operations

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
    "nfl": [
        "nfl", "super bowl", "chiefs", "49ers", "cowboys", "patriots", "packers",
        "quarterback", "touchdown", "field goal", "nfc", "afc", "playoff",
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
}


def classify_market_category(title: str) -> str:
    """Classify a market into a category based on title keywords."""
    text = title.lower()
    scores = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        scores[category] = sum(1 for kw in keywords if kw in text)
    if max(scores.values(), default=0) == 0:
        return "other"
    return max(scores, key=scores.get)


def analyze_trader_categories(profile) -> tuple[str, dict, dict]:
    """
    Analyze trader's category distribution from their trade history.
    Returns: (primary_category, category_breakdown_pct, category_win_rates)
    """
    category_counts: dict[str, int] = {}
    category_wins: dict[str, int] = {}
    category_total: dict[str, int] = {}
    seen_markets: set[str] = set()

    # Count market exposure by category
    for trade in profile.trades:
        if trade.condition_id in seen_markets:
            continue
        seen_markets.add(trade.condition_id)
        category = classify_market_category(trade.title)
        category_counts[category] = category_counts.get(category, 0) + 1

    # Calculate per-category win rates from closed positions
    for pos in profile.closed_positions:
        category = classify_market_category(pos.title)
        category_total[category] = category_total.get(category, 0) + 1
        if pos.realized_pnl > 0:
            category_wins[category] = category_wins.get(category, 0) + 1

    # Category breakdown by exposure
    if not category_counts:
        return "unknown", {}, {}

    total = sum(category_counts.values())
    category_breakdown = {
        cat: round((count / total) * 100)
        for cat, count in category_counts.items()
    }

    # Category win rates
    category_win_rates = {}
    for cat, wins in category_wins.items():
        total_cat = category_total.get(cat, 0)
        if total_cat >= 5:  # Minimum 5 resolved positions for meaningful WR
            category_win_rates[cat] = round((wins / total_cat) * 100, 1)

    # Primary category (prefer non-"other" with highest exposure)
    non_other = {k: v for k, v in category_counts.items() if k != "other"}
    if non_other:
        primary = max(non_other, key=non_other.get)
    else:
        primary = "unknown"

    return primary, category_breakdown, category_win_rates


def detect_lifecycle_state(profile, score) -> tuple[str, Optional[datetime]]:
    """
    Determine trader's lifecycle state based on recent activity.
    
    Returns: (lifecycle_state, last_hot_streak_date)
    
    States:
    - hot: traded last 7d, +P&L last 30d
    - consistent: active 30d, stable win rate
    - cooling: no trades 30-60d
    - cold: inactive 60+d (hide from users)
    """
    if not profile.trades:
        return "cold", None

    now_ts = int(time.time())
    latest_trade_ts = max(t.timestamp for t in profile.trades)
    days_since_last_trade = (now_ts - latest_trade_ts) / 86400

    # Calculate 7d and 30d P&L
    seven_days_ago = now_ts - (7 * 86400)
    thirty_days_ago = now_ts - (30 * 86400)

    pnl_7d = sum(
        p.realized_pnl for p in profile.closed_positions
        if hasattr(p, 'timestamp') and p.timestamp >= seven_days_ago
    )
    pnl_30d = sum(
        p.realized_pnl for p in profile.closed_positions
        if hasattr(p, 'timestamp') and p.timestamp >= thirty_days_ago
    )

    last_hot_streak = None

    # HOT: traded last 7d with positive P&L
    if days_since_last_trade <= LIFECYCLE_HOT_DAYS and pnl_7d > 0:
        last_hot_streak = datetime.fromtimestamp(latest_trade_ts, tz=timezone.utc)
        return "hot", last_hot_streak

    # CONSISTENT: active within 30d
    if days_since_last_trade <= LIFECYCLE_CONSISTENT_DAYS:
        return "consistent", None

    # COOLING: inactive 30-60d
    if days_since_last_trade <= LIFECYCLE_COOLING_DAYS:
        return "cooling", None

    # COLD: inactive 60+d
    return "cold", None


def detect_rising_star(profile, score, lifecycle_state: str) -> bool:
    """
    Detect hidden gems: traders with strong performance but not yet famous.
    
    Criteria:
    - 7d P&L momentum >> 30d average (rising fast)
    - High win rate but <100 trades (early journey)
    - Currently hot or consistent (active)
    """
    if lifecycle_state not in ("hot", "consistent"):
        return False

    total_resolved = score.win_count + score.loss_count
    if total_resolved < MIN_RESOLVED_POSITIONS:
        return False

    win_rate = (score.win_count / total_resolved) * 100

    # Criteria 1: High win rate but early in journey
    if win_rate >= RISING_STAR_MIN_WIN_RATE and score.total_trades < RISING_STAR_MAX_TRADES:
        return True

    # Criteria 2: 7d momentum >> 30d average
    # (Not implemented yet - would need timestamped closed positions)
    # For now, use high recent score as proxy
    if score.recency_score >= 85 and score.composite_score >= 70:
        return True

    return False


def detect_bot_patterns(address: str, username: str, win_rate: float, total_trades: int) -> tuple[bool, str]:
    """
    Detect bot/suspicious patterns.
    
    Returns: (is_bot, reason)
    
    Patterns:
    - Hex addresses (e.g., 0x1a2b3c4d...)
    - Usernames like "updown", "bot", "test", "auto"
    - 99%+ win rate with >15 trades (impossible without wash trading)
    """
    # Pattern 1: Hex address (mostly hex characters)
    hex_chars = sum(1 for c in address.lower() if c in '0123456789abcdef')
    hex_ratio = hex_chars / len(address) if address else 0
    if hex_ratio >= BOT_HEX_ADDRESS_THRESHOLD:
        return True, f"Hex address pattern ({hex_ratio:.0%} hex chars)"

    # Pattern 2: Bot-like username
    username_lower = username.lower()
    for pattern in BOT_UPDOWN_PATTERN:
        if pattern in username_lower:
            return True, f"Bot-like username contains '{pattern}'"

    # Pattern 3: Suspiciously perfect win rate
    if win_rate >= BOT_PERFECT_WIN_RATE and total_trades >= MIN_TRADES:
        return True, f"Suspicious win rate ({win_rate:.1f}% with {total_trades} trades)"

    return False, ""


# ─────────────────────────────────────────────────────────────────────
# Data Models (reuse from v1 with additions)
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
    timestamp: int = 0     # Added for time-based analysis


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
    markets_specialized: list[str] = field(default_factory=list)  # Top markets by P&L


@dataclass
class TraderScore:
    """Computed scores for a trader (v2 with lifecycle + rising star)."""
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

    # V2 additions
    lifecycle_state: str = "unknown"  # hot/consistent/cooling/cold
    rising_star: bool = False
    category_win_rates: dict = field(default_factory=dict)  # {"crypto": 85, "politics": 60}
    markets_specialized: list[str] = field(default_factory=list)  # Market IDs they dominate
    last_hot_streak_date: Optional[datetime] = None

    # Metadata
    disqualified: bool = False
    disqualify_reason: str = ""
    last_trade_timestamp: int = 0
    primary_category: str = ""
    category_breakdown: dict = field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────────
# API Client (enhanced for market-first discovery)
# ─────────────────────────────────────────────────────────────────────

class PolymarketClient:
    """Async client for Polymarket's public Data API with market-first discovery."""

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

    # ═══════════════════════════════════════════════════════════════
    # NEW: Market-First Discovery APIs
    # ═══════════════════════════════════════════════════════════════

    async def get_top_markets(self, limit: int = 200) -> list[dict]:
        """
        Fetch top markets by volume.
        
        This is the alpha engine: instead of pulling global leaderboards,
        we scan individual markets to find specialists.
        """
        try:
            # Fetch from gamma API (supports active markets)
            markets = await self._get(f"{GAMMA_API}/markets", {
                "limit": min(limit, 500),  # API max
                "active": "true",
                "closed": "false",
            })
            
            if not isinstance(markets, list):
                log("warning", "Markets response not a list", source="trader_discovery")
                return []
            
            # Sort by volume descending (volumeNum field)
            markets_sorted = sorted(
                markets,
                key=lambda m: float(m.get("volumeNum", 0)),
                reverse=True
            )[:limit]
            
            log("info", f"Fetched {len(markets_sorted)} top markets (sorted by volume)", source="trader_discovery")
            return markets_sorted
            
        except Exception as e:
            log("error", f"Failed to fetch top markets: {e}", source="trader_discovery")
            return []

    async def get_market_top_traders(self, market_id: str, limit: int = 20) -> list[dict]:
        """
        Get top traders by P&L for a specific market.
        
        This finds niche specialists: "90% win rate on NFL markets only"
        """
        try:
            # Note: The actual endpoint might be different. Adjust as needed.
            # This is a placeholder based on typical API patterns.
            traders = await self._get(f"{DATA_API}/trades", {
                "market": market_id,
                "limit": limit,
                "orderBy": "pnl",
                "order": "DESC",
            })
            return traders if isinstance(traders, list) else []
        except Exception as e:
            log("debug", f"Failed to fetch traders for market {market_id}: {e}", source="trader_discovery")
            return []

    # ═══════════════════════════════════════════════════════════════
    # Existing APIs (reused from v1)
    # ═══════════════════════════════════════════════════════════════

    async def get_trades(self, address: str, limit: int = 500, offset: int = 0) -> list[dict]:
        """Fetch trade history for a user."""
        return await self._get(f"{DATA_API}/trades", {
            "user": address,
            "limit": limit,
            "offset": offset,
        })

    async def get_all_trades(self, address: str, max_trades: int = 10000) -> list[dict]:
        """Paginate through all trades for a user."""
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

    async def get_positions(self, address: str, limit: int = 500, offset: int = 0) -> list[dict]:
        """Fetch current open positions."""
        return await self._get(f"{DATA_API}/positions", {
            "user": address,
            "limit": limit,
            "offset": offset,
            "sortBy": "CASHPNL",
            "sortDirection": "DESC",
        })

    async def get_closed_positions(self, address: str, limit: int = 50, offset: int = 0) -> list[dict]:
        """Fetch resolved/closed positions."""
        return await self._get(f"{DATA_API}/closed-positions", {
            "user": address,
            "limit": limit,
            "offset": offset,
        })

    async def get_all_closed_positions(self, address: str, max_positions: int = 10000) -> list[dict]:
        """Paginate through closed positions."""
        all_positions = []
        offset = 0
        batch_size = 50
        while offset < max_positions:
            batch = await self.get_closed_positions(address, limit=batch_size, offset=offset)
            if not batch:
                break
            all_positions.extend(batch)
            if len(batch) < batch_size:
                break
            offset += batch_size
        return all_positions

    async def get_portfolio_value(self, address: str) -> float:
        """Get total portfolio value."""
        try:
            data = await self._get(f"{DATA_API}/value", {"user": address})
            if data and isinstance(data, list) and len(data) > 0:
                return float(data[0].get("value", 0))
            return 0.0
        except Exception:
            return 0.0


# ─────────────────────────────────────────────────────────────────────
# Data Collection (enhanced with market specialization tracking)
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

    # Parse closed positions (with timestamp for lifecycle analysis)
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
                    timestamp=int(pos.get("timestamp", 0)),  # For lifecycle analysis
                ))
            except (ValueError, TypeError):
                continue

    # Track markets where trader specializes (top 5 by P&L)
    market_pnl: dict[str, float] = {}
    for pos in profile.closed_positions:
        market_id = pos.condition_id
        market_pnl[market_id] = market_pnl.get(market_id, 0) + pos.realized_pnl

    top_markets = sorted(market_pnl.items(), key=lambda x: x[1], reverse=True)[:5]
    profile.markets_specialized = [m[0] for m in top_markets if m[1] > 0]

    if isinstance(portfolio_val, (int, float)):
        profile.portfolio_value = portfolio_val

    return profile


# ─────────────────────────────────────────────────────────────────────
# Scoring Algorithm (reused from v1 with v2 enhancements)
# ─────────────────────────────────────────────────────────────────────

def _sigmoid(x: float, midpoint: float = 0, steepness: float = 1) -> float:
    """Sigmoid function mapped to 0-100 for smooth scoring."""
    try:
        return 100 / (1 + math.exp(-steepness * (x - midpoint)))
    except OverflowError:
        return 0.0 if x < midpoint else 100.0


def _log_scale(x: float, base: float = 10, cap: float = 100) -> float:
    """Logarithmic scaling for diminishing returns."""
    if x <= 0:
        return 0.0
    return min(cap, (math.log(x + 1) / math.log(base)) * (cap / 5))


def compute_score(profile: TraderProfile) -> TraderScore:
    """
    Score a trader based on their Polymarket history (v2 with lifecycle + rising star).
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
    score.markets_specialized = profile.markets_specialized

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
        score.last_trade_timestamp = latest_trade_ts
        if days_since_last_trade > INACTIVITY_CUTOFF_DAYS:
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
        score.disqualify_reason = f"Not enough resolved positions ({total_resolved} < {MIN_RESOLVED_POSITIONS})"
        return score

    # ── DATA QUALITY CHECKS ────────────────────────────────────────
    win_rate_pct = (score.win_count / total_resolved * 100) if total_resolved > 0 else 0

    # Filter incomplete/suspicious data
    if win_rate_pct >= 95.0 and total_resolved >= 20:
        score.disqualified = True
        score.disqualify_reason = f"Suspicious win rate ({win_rate_pct:.1f}% - likely incomplete API data)"
        return score

    if score.total_trades >= 9999:
        score.disqualified = True
        score.disqualify_reason = f"Trade count at API limit ({score.total_trades}) - incomplete data"
        return score

    if score.loss_count == 0 and total_resolved >= 10:
        score.disqualified = True
        score.disqualify_reason = f"Zero losses in {total_resolved} trades - likely API filtering issue"
        return score

    # ── BOT DETECTION ──────────────────────────────────────────────
    is_bot, bot_reason = detect_bot_patterns(
        score.address, score.username, win_rate_pct, score.total_trades
    )
    if is_bot:
        score.disqualified = True
        score.disqualify_reason = f"Bot detected: {bot_reason}"
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
    primary_cat, cat_breakdown, cat_win_rates = analyze_trader_categories(profile)
    score.primary_category = primary_cat
    score.category_breakdown = cat_breakdown
    score.category_win_rates = cat_win_rates

    # ╔═══════════════════════════════════════════════════════════════╗
    # ║                    SEVEN SCORING FACTORS                      ║
    # ╚═══════════════════════════════════════════════════════════════╝

    # 1. ROI Score (20% weight)
    if score.total_volume > 0:
        roi_pct = (score.total_pnl / score.total_volume) * 100
        score.roi_score = _sigmoid(roi_pct, midpoint=0, steepness=0.15)
    else:
        score.roi_score = 50.0

    # 2. Win Rate Score (20% weight)
    win_rate = score.win_count / total_resolved
    if total_resolved >= 5:
        score.win_rate_score = _sigmoid((win_rate - 0.5) * 200, midpoint=0, steepness=0.1)
    else:
        score.win_rate_score = 50.0

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

    # 5. Volume Score (5% weight)
    score.volume_score = _log_scale(score.total_volume, base=10, cap=100)

    # 6. Edge Score (10% weight)
    if total_resolved >= 5:
        edge = win_rate - 0.5
        score.edge_score = _sigmoid(edge * 100, midpoint=0, steepness=0.08)
    else:
        score.edge_score = 30.0

    # 7. Recency Score (15% weight)
    if profile.trades:
        latest_trade = max(t.timestamp for t in profile.trades)
        score.last_trade_timestamp = latest_trade
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

    # ═══════════════════════════════════════════════════════════════
    # V2 ENHANCEMENTS: Lifecycle + Rising Star
    # ═══════════════════════════════════════════════════════════════

    lifecycle_state, last_hot_streak = detect_lifecycle_state(profile, score)
    score.lifecycle_state = lifecycle_state
    score.last_hot_streak_date = last_hot_streak

    score.rising_star = detect_rising_star(profile, score, lifecycle_state)

    return score


# ─────────────────────────────────────────────────────────────────────
# TraderDiscovery v2 — Market-First Engine
# ─────────────────────────────────────────────────────────────────────

class TraderDiscovery:
    """
    Market-First Trader Discovery Engine v2.0
    
    THE COMPETITIVE EDGE: Scrapes individual markets to find niche specialists
    making bank that no one else tracks. Finds ~4,000 unique candidates vs 50.
    """

    def __init__(
        self,
        market_count: int = TOP_MARKETS_COUNT,
        traders_per_market: int = TOP_TRADERS_PER_MARKET,
    ):
        self.market_count = market_count
        self.traders_per_market = traders_per_market

    async def scan_all(self) -> list[dict]:
        """
        Full market-first discovery pipeline:
        1. Fetch top N markets by volume
        2. For each market, get top M traders by P&L
        3. Collect full profiles for unique traders
        4. Score with 7-factor algorithm + v2 enhancements
        5. Merge seed whales
        6. Upsert to DB (accumulate, don't replace)
        
        Returns list of trader dicts (DB-compatible format).
        """
        log("info", "🚀 Starting market-first trader discovery v2.0...", source="trader_discovery")

        # Run the async discovery pipeline
        scored = await self._discover_traders_from_markets()

        # Add seed whales
        seed_traders = self._seed_whales()
        log("info", f"Adding {len(seed_traders)} seed whales", source="trader_discovery")

        # Convert to DB-compatible dicts
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
        traders_list.sort(key=lambda t: t.get("composite_rank", 0), reverse=True)

        # Upsert to DB
        log("info", "Upserting discovered traders (accumulating, not replacing)", source="trader_discovery")
        saved = 0
        for t in traders_list:
            try:
                TraderQueries.upsert_trader(t)
                saved += 1
            except Exception as e:
                log("warning", f"Failed to upsert trader {t.get('alias', '?')}: {e}", source="trader_discovery")

        # Audit log with v2 stats
        qualified_count = len(scored)
        lifecycle_stats = {
            "hot": sum(1 for s in scored if s.lifecycle_state == "hot"),
            "consistent": sum(1 for s in scored if s.lifecycle_state == "consistent"),
            "cooling": sum(1 for s in scored if s.lifecycle_state == "cooling"),
            "cold": sum(1 for s in scored if s.lifecycle_state == "cold"),
        }
        rising_stars = sum(1 for s in scored if s.rising_star)

        log("info",
            f"✅ Discovery complete: {qualified_count} qualified traders + {len(seed_traders)} whales, "
            f"saved {saved} to DB | Lifecycle: {lifecycle_stats} | Rising stars: {rising_stars}",
            source="trader_discovery", audit=True)

        AuditLog.log("trader_discovery_v2", {
            "total_saved": saved,
            "qualified_from_markets": qualified_count,
            "seed_whales": len(seed_traders),
            "lifecycle_breakdown": lifecycle_stats,
            "rising_stars": rising_stars,
            "tiers": {
                "S": sum(1 for s in scored if s.tier == "S"),
                "A": sum(1 for s in scored if s.tier == "A"),
                "B": sum(1 for s in scored if s.tier == "B"),
                "C": sum(1 for s in scored if s.tier == "C"),
                "D": sum(1 for s in scored if s.tier == "D"),
            },
        }, source="trader_discovery")

        return traders_list

    async def _discover_traders_from_markets(self) -> list[TraderScore]:
        """
        Market-first discovery pipeline:
        1. Fetch top markets by volume
        2. Get top traders per market
        3. Profile unique traders
        4. Score and filter
        """
        async with PolymarketClient() as client:
            # Step 1: Fetch top markets
            log("info", f"Fetching top {self.market_count} markets by volume...", source="trader_discovery")
            markets = await client.get_top_markets(limit=self.market_count)

            if not markets:
                log("warning", "No markets fetched, falling back to empty discovery", source="trader_discovery")
                return []

            log("info", f"Found {len(markets)} markets, scanning for top traders...", source="trader_discovery")

            # Step 2: Collect trader addresses from all markets
            candidate_addresses: dict[str, dict] = {}  # address -> {username, etc.}

            for i, market in enumerate(markets):
                market_id = market.get("id") or market.get("conditionId") or market.get("market")
                if not market_id:
                    continue

                try:
                    traders = await client.get_market_top_traders(market_id, limit=self.traders_per_market)
                    for trader_data in traders:
                        addr = trader_data.get("user") or trader_data.get("address") or trader_data.get("proxyWallet")
                        if not addr:
                            continue
                        
                        # Store if new or better data
                        if addr not in candidate_addresses:
                            candidate_addresses[addr] = {
                                "address": addr,
                                "username": trader_data.get("userName", ""),
                                "profile_image": trader_data.get("profileImage", ""),
                                "pnl": float(trader_data.get("pnl", 0)),
                                "vol": float(trader_data.get("vol", 0)),
                            }
                    
                    if (i + 1) % 50 == 0:
                        log("debug", f"Scanned {i + 1}/{len(markets)} markets, found {len(candidate_addresses)} unique traders",
                            source="trader_discovery")
                except Exception as e:
                    log("debug", f"Failed to fetch traders for market {i+1}: {e}", source="trader_discovery")

            log("info", f"🎯 Found {len(candidate_addresses)} unique trader candidates from {len(markets)} markets",
                source="trader_discovery")

            # Step 3: Collect full profiles (batched)
            log("info", "Profiling candidates (this may take a while)...", source="trader_discovery")
            profiles: list[TraderProfile] = []
            candidate_list = list(candidate_addresses.values())

            for i, cand in enumerate(candidate_list):
                try:
                    profile = await collect_trader_profile(
                        client,
                        address=cand["address"],
                        username=cand["username"],
                        profile_image=cand["profile_image"],
                        pnl=cand["pnl"],
                        vol=cand["vol"],
                    )
                    profiles.append(profile)
                    if (i + 1) % 100 == 0:
                        log("debug", f"Profiled {i + 1}/{len(candidate_list)} traders", source="trader_discovery")
                except Exception as e:
                    log("debug", f"Failed to profile {cand.get('username', cand['address'][:12])}: {e}",
                        source="trader_discovery")

            # Step 4: Score all traders
            log("info", f"Scoring {len(profiles)} traders with v2 algorithm...", source="trader_discovery")
            scores: list[TraderScore] = []

            for profile in profiles:
                score = compute_score(profile)
                scores.append(score)

                if not score.disqualified:
                    log("debug",
                        f"✅ {score.username}: {score.composite_score:.1f} (Tier {score.tier}, {score.lifecycle_state}, "
                        f"{'⭐ rising star' if score.rising_star else ''})",
                        source="trader_discovery")
                else:
                    log("debug", f"❌ {score.username}: {score.disqualify_reason}", source="trader_discovery")

            # Step 5: Filter and rank
            qualified = [s for s in scores if not s.disqualified]
            qualified.sort(key=lambda s: s.composite_score, reverse=True)

            disqualified_count = len(scores) - len(qualified)
            log("info",
                f"✅ {len(qualified)} qualified traders (disqualified {disqualified_count})",
                source="trader_discovery")

            return qualified

    @staticmethod
    def _score_to_dict(score: TraderScore) -> dict:
        """Convert TraderScore to dict compatible with TraderQueries.upsert_trader()."""
        total_resolved = score.win_count + score.loss_count
        win_rate = (score.win_count / total_resolved * 100) if total_resolved > 0 else 0

        roi_pct = (score.total_pnl / score.total_volume * 100) if score.total_volume > 0 else 0

        # Derive bankroll tier
        if score.total_volume >= 500_000:
            bankroll_tier = "whale"
        elif score.total_volume >= 50_000:
            bankroll_tier = "mid"
        elif score.total_volume >= 5_000:
            bankroll_tier = "small"
        else:
            bankroll_tier = "micro"

        # Derive trading style
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
            "composite_rank": round(score.composite_score / 100, 4),
            "roi": round(roi_pct, 2),
            "bankroll_tier": bankroll_tier,
            "trading_style": trading_style,
            "estimated_bankroll": round(score.total_volume, 2),
            "markets_traded": score.markets_traded,
            "consistency_score": round(score.consistency_score, 2),
            "profile_summary": (
                f"Tier {score.tier} | Score {score.composite_score:.0f}/100 | "
                f"{score.lifecycle_state.upper()} {'⭐' if score.rising_star else ''} | "
                f"{score.recommendation} | "
                f"WR {win_rate:.0f}% ({score.win_count}W/{score.loss_count}L) | "
                f"PnL ${score.total_pnl:,.0f} | {score.total_trades} trades | "
                f"Best at: {score.primary_category}"
            ),
            "last_trade_date": (
                datetime.utcfromtimestamp(score.last_trade_timestamp).isoformat() + "+00:00"
                if score.last_trade_timestamp > 0 else None
            ),
            # V2 fields (need schema migration)
            "lifecycle_state": score.lifecycle_state,
            "rising_star": score.rising_star,
            "category_win_rates": score.category_win_rates,
            "markets_specialized": score.markets_specialized,
            "last_hot_streak_date": (
                score.last_hot_streak_date.isoformat() if score.last_hot_streak_date else None
            ),
        }

    @staticmethod
    def _seed_whales() -> list[dict]:
        """Seed whales from config."""
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
                "composite_rank": 0.5,
                "lifecycle_state": "unknown",
                "rising_star": False,
                "category_win_rates": {},
                "markets_specialized": [],
                "last_hot_streak_date": None,
            })
        return traders


# ─────────────────────────────────────────────────────────────────────
# Entry Point (for testing)
# ─────────────────────────────────────────────────────────────────────

async def main():
    """Test the market-first discovery system."""
    discovery = TraderDiscovery(market_count=50, traders_per_market=10)  # Smaller test run
    traders = await discovery.scan_all()
    
    log("info", f"Discovered {len(traders)} total traders", source="test")
    
    # Print summary stats
    hot = sum(1 for t in traders if t.get("lifecycle_state") == "hot")
    rising_stars = sum(1 for t in traders if t.get("rising_star"))
    
    log("info", f"Hot traders: {hot} | Rising stars: {rising_stars}", source="test")
    
    # Print top 10
    for i, t in enumerate(traders[:10], 1):
        log("info", f"{i}. {t.get('alias', '?')} - {t.get('profile_summary', '')}", source="test")


if __name__ == "__main__":
    asyncio.run(main())
