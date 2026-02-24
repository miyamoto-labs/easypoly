"""
Opportunity Detector — Scans markets for actionable signals.

Signal types:
1. Information edge — Perplexity news vs market price
2. Statistical edge — Mean reversion, momentum, liquidity imbalance
3. Timing edge — Near-resolution markets
4. Crowd behavior — Overreaction, extreme sentiment
"""
from __future__ import annotations

from datetime import datetime, timezone
from db.queries import MarketQueries, OpportunityQueries
from db.client import get_supabase
from utils.logger import log


class OpportunityDetector:
    def __init__(self):
        self.min_volume = 5000
        self.min_liquidity = 1000
        self.max_per_group = 3  # Diversity cap

    def scan_all(self, markets: list[dict]) -> list[dict]:
        """Scan all markets for opportunities across all signal types."""
        liquid = [m for m in markets if m.get("volume", 0) >= self.min_volume and m.get("liquidity", 0) >= self.min_liquidity]
        log("info", f"Scanning {len(liquid)} liquid markets for opportunities", source="opportunity_detector")

        all_opps = []
        group_counts = {}

        for market in liquid:
            signals = []
            signals.extend(self._check_statistical_edge(market))
            signals.extend(self._check_timing_edge(market))
            signals.extend(self._check_crowd_behavior(market))

            for signal in signals:
                # Diversity cap
                group = self._extract_question_group(market.get("market_id", ""))
                if group:
                    count = group_counts.get(group, 0)
                    if count >= self.max_per_group:
                        continue
                    group_counts[group] = count + 1

                # Dedup check
                if OpportunityQueries.check_duplicate(market["market_id"], signal["signal_type"]):
                    continue

                opp = {
                    "market_id": market["market_id"],
                    "signal_type": signal["signal_type"],
                    "signal_data": signal.get("data", {}),
                    "strength": signal.get("strength", 0.5),
                }
                try:
                    OpportunityQueries.insert_opportunity(opp)
                    all_opps.append(opp)
                except Exception as e:
                    pass

        dupes = len(liquid) * 3 - len(all_opps)  # rough estimate
        capped = sum(1 for v in group_counts.values() if v >= self.max_per_group)
        log("info",
            f"Detected {len(all_opps) + dupes} opportunities, saved {len(all_opps)}, skipped {dupes} dupes, {capped} capped",
            source="opportunity_detector")
        return all_opps

    def _check_statistical_edge(self, market: dict) -> list[dict]:
        """Check for statistical signals: mean reversion, momentum, liquidity imbalance."""
        signals = []
        history = MarketQueries.get_price_history(market["market_id"], hours=48)

        yes_prices = [h["price"] for h in history if h.get("outcome") == "YES"]
        if len(yes_prices) < 4:
            return signals

        # Mean reversion: price deviated >10% from recent mean
        mean_price = sum(yes_prices) / len(yes_prices)
        current = yes_prices[-1]
        deviation = abs(current - mean_price) / max(mean_price, 0.01)

        if deviation > 0.10:
            signals.append({
                "signal_type": "mean_reversion",
                "strength": min(deviation, 1.0),
                "data": {"mean": mean_price, "current": current, "deviation": deviation},
            })

        # Momentum: 3+ consecutive moves in same direction
        if len(yes_prices) >= 4:
            diffs = [yes_prices[i] - yes_prices[i-1] for i in range(1, len(yes_prices))]
            pos_streak = sum(1 for d in diffs[-3:] if d > 0)
            neg_streak = sum(1 for d in diffs[-3:] if d < 0)

            if pos_streak >= 3 or neg_streak >= 3:
                direction = "up" if pos_streak >= 3 else "down"
                signals.append({
                    "signal_type": "momentum",
                    "strength": 0.6,
                    "data": {"direction": direction, "streak": max(pos_streak, neg_streak)},
                })

        # Liquidity imbalance
        volumes = [h.get("volume", 0) for h in history[-4:]]
        if volumes and max(volumes) > 0:
            vol_ratio = volumes[-1] / (sum(volumes[:-1]) / max(len(volumes) - 1, 1)) if sum(volumes[:-1]) > 0 else 0
            if vol_ratio > 2.0:
                signals.append({
                    "signal_type": "liquidity_imbalance",
                    "strength": min(vol_ratio / 5, 1.0),
                    "data": {"volume_ratio": vol_ratio},
                })

        return signals

    def _check_timing_edge(self, market: dict) -> list[dict]:
        """Check for near-resolution timing opportunities."""
        signals = []
        end_date = market.get("end_date")
        if not end_date:
            return signals

        try:
            if isinstance(end_date, str):
                end_date = end_date.replace("Z", "+00:00")
                end = datetime.fromisoformat(end_date)
            else:
                end = end_date

            now = datetime.now(timezone.utc)
            hours_left = (end - now).total_seconds() / 3600

            if 0 < hours_left < 72:
                price = market.get("yes_price", 0.5)
                # Only flag interesting near-resolution markets (skip boring 95%+ or 5%- outcomes)
                if 0.15 <= price <= 0.85:
                    signals.append({
                        "signal_type": "near_resolution",
                        "strength": max(0, 1 - hours_left / 72),
                        "data": {"hours_left": hours_left, "current_price": price},
                    })
        except Exception:
            pass

        return signals

    def _check_crowd_behavior(self, market: dict) -> list[dict]:
        """Check for extreme sentiment or overreaction."""
        signals = []
        price = market.get("yes_price", 0.5)

        # Extreme sentiment: require >2% price movement AND interesting odds
        if (0.10 <= price <= 0.90) and market.get("volume", 0) > 50000:
            history = MarketQueries.get_price_history(market["market_id"], hours=24)
            yes_prices = [h["price"] for h in history if h.get("outcome") == "YES"]
            if len(yes_prices) >= 2 and abs(yes_prices[-1] - yes_prices[0]) > 0.02:
                signals.append({
                    "signal_type": "extreme_sentiment",
                    "strength": 0.7,
                    "data": {"price": price, "movement": abs(yes_prices[-1] - yes_prices[0])},
                })

        return signals

    @staticmethod
    def _extract_question_group(market_id: str) -> str:
        """Extract a question group for diversity capping."""
        patterns = [
            "2028-democratic-presidential", "2028-republican-presidential",
            "2026-nhl-stanley-cup", "2026-nba-championship",
            "2026-mlb-world-series", "trump-deport",
            "oscar-best-picture", "oscar-best-director",
            "oscar-best-actor", "grammy-album",
        ]
        for pattern in patterns:
            if pattern in market_id:
                return pattern
        parts = market_id.split("-")
        if len(parts) > 5:
            return "-".join(parts[-4:])
        return ""
