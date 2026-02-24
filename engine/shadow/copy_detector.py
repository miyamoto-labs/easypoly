"""
Copy Detector — Monitors top traders from EACH bankroll tier for new positions.
Detects when tracked traders enter new markets and generates copy signals.

Upgraded: Now monitors top 5 from each tier (up to 20 total) instead of just top 10 overall.
This ensures copy signals from micro/small traders, not just whales.
"""
from __future__ import annotations

import requests
from datetime import datetime, timezone

from config import CLOB_HOST, GAMMA_API, TRADER_DISCOVERY_CONFIG
from db.client import get_supabase
from db.queries import TraderQueries, MarketQueries
from utils.logger import log
from utils.rate_limiter import rate_limiter

DATA_API = "https://data-api.polymarket.com"


class CopyDetector:
    def __init__(self, max_traders: int = 20):
        self.max_traders = max_traders
        self.top_per_tier = TRADER_DISCOVERY_CONFIG.get("top_per_tier", 5)

    def detect_signals(self) -> list[dict]:
        # Get top traders from EACH bankroll tier for diverse coverage
        top_traders = TraderQueries.get_top_traders_by_tier(top_per_tier=self.top_per_tier)

        # Fallback: if tier-based query returns nothing, use overall top traders
        if not top_traders:
            top_traders = TraderQueries.get_top_traders(limit=self.max_traders)

        if not top_traders:
            top_traders = []

        # Include user-added traders that have active followers
        seen_ids = {t["id"] for t in top_traders}
        try:
            custom_traders = TraderQueries.get_followed_custom_traders()
            for ct in custom_traders:
                if ct["id"] not in seen_ids:
                    top_traders.append(ct)
                    seen_ids.add(ct["id"])
            if custom_traders:
                log("info",
                    f"Added {len(custom_traders)} user-tracked wallets to monitoring pool",
                    source="copy_detector")
        except Exception as e:
            log("warning", f"Failed to fetch custom traders: {e}", source="copy_detector")

        if not top_traders:
            return []

        # Log tier distribution
        tier_counts = {}
        for t in top_traders:
            tier = t.get("bankroll_tier", "unknown")
            tier_counts[tier] = tier_counts.get(tier, 0) + 1

        log("info",
            f"Monitoring {len(top_traders)} traders across tiers: {tier_counts}",
            source="copy_detector")

        signals = []
        for trader in top_traders:
            try:
                new_positions = self._check_trader(trader)
                signals.extend(new_positions)
            except Exception as e:
                log("warning", f"Error checking trader {trader.get('alias', '?')}: {e}", source="copy_detector")

        if signals:
            log("info", f"Detected {len(signals)} new copy signals", source="copy_detector")

        return signals

    def _check_trader(self, trader: dict) -> list[dict]:
        wallet = trader.get("wallet_address", "")
        if not wallet:
            return []

        rate_limiter.wait("polymarket")
        positions = self._fetch_positions(wallet)
        if not positions:
            return []

        sb = get_supabase()
        existing = sb.table("ep_trader_trades").select("market_id, direction").eq("trader_id", trader["id"]).execute()
        seen_keys = {(t["market_id"], t["direction"]) for t in (existing.data or [])}

        new_signals = []
        for pos in positions:
            market_id = pos.get("slug", pos.get("eventSlug", pos.get("market", "")))
            if not market_id and isinstance(pos.get("asset"), dict):
                market_id = pos["asset"].get("market", "")

            outcome = pos.get("outcome", "")
            direction = "YES" if outcome == "Yes" else "NO"
            current_value = float(pos.get("currentValue", 0))
            size = float(pos.get("size", 0))
            price = float(pos.get("avgPrice", pos.get("price", 0)))
            value = current_value if current_value > 0 else size * price if price > 0 else size

            if not market_id or value < 10:  # Lowered from $100 to $10 to catch micro traders
                continue

            key = (market_id, direction)
            if key in seen_keys:
                continue

            trade_record = {
                "trader_id": trader["id"],
                "market_id": market_id,
                "direction": direction,
                "amount": value,
                "price": price,
                "trade_type": "entry",
            }
            try:
                TraderQueries.insert_trader_trade(trade_record)
            except Exception as e:
                log("warning", f"Failed to save trader trade: {e}", source="copy_detector")

            market = MarketQueries.get_market_by_id(market_id)
            question = market.get("question", market_id) if market else market_id

            signal = {
                "trader_alias": trader.get("alias", wallet[:10]),
                "trader_address": wallet,
                "trader_pnl": trader.get("total_pnl", 0),
                "trader_rank": trader.get("composite_rank", 0),
                "trader_roi": trader.get("roi", 0),
                "trader_tier": trader.get("bankroll_tier", "unknown"),
                "trader_style": trader.get("trading_style", "unknown"),
                "market_id": market_id,
                "question": question,
                "direction": direction,
                "size": value,
                "price": price,
                "detected_at": datetime.now(timezone.utc).isoformat(),
            }
            new_signals.append(signal)

            tier_emoji = {"micro": "🟣", "small": "🔵", "mid": "🟡", "whale": "🟢"}.get(
                trader.get("bankroll_tier", ""), "⚪"
            )
            style_emoji = {"degen": "🎰", "sniper": "🎯", "grinder": "⚙️", "whale": "🐋"}.get(
                trader.get("trading_style", ""), ""
            )
            log("info",
                f"COPY SIGNAL {tier_emoji}{style_emoji}: "
                f"{trader.get('alias', '?')} ({trader.get('bankroll_tier', '?')}/{trader.get('trading_style', '?')}) "
                f"→ {direction} {market_id[:30]} (${value:,.0f})",
                source="copy_detector")

        return new_signals

    def _fetch_positions(self, wallet_address: str) -> list[dict]:
        min_val = TRADER_DISCOVERY_CONFIG.get("min_position_value", 10)
        try:
            response = requests.get(
                f"{DATA_API}/positions",
                params={"user": wallet_address, "sizeThreshold": min_val, "limit": 50},
                timeout=15,
            )
            if response.status_code == 200:
                data = response.json()
                if data:
                    return data if isinstance(data, list) else data.get("positions", [])
        except Exception:
            pass
        try:
            response = requests.get(f"{CLOB_HOST}/positions", params={"user": wallet_address}, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data:
                    return data if isinstance(data, list) else data.get("positions", [])
        except Exception:
            pass
        return []

    def format_copy_signal(self, signal: dict) -> dict:
        tier_label = signal.get("trader_tier", "unknown").capitalize()
        style_label = signal.get("trader_style", "unknown").capitalize()
        roi_str = f"{signal.get('trader_roi', 0):.0f}% ROI" if signal.get("trader_roi") else ""

        return {
            "question": f"🔄 {signal['trader_alias']} copied: {signal['question']}",
            "side": signal["direction"],
            "price": signal["price"],
            "confidence": "Medium",
            "reasoning": (
                f"[{tier_label} {style_label}] {signal['trader_alias']} "
                f"(PnL: ${signal['trader_pnl']:,.0f}{', ' + roi_str if roi_str else ''}) "
                f"entered {signal['direction']} position worth ${signal['size']:,.0f}. "
                f"Rank: {signal['trader_rank']:.2f}/1.0."
            ),
            "tokenId": "",
            "createdAt": signal["detected_at"],
        }
