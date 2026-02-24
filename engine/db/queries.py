"""All database query classes for EasyPoly."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from db.client import get_supabase


class MarketQueries:
    """CRUD for ep_markets_raw, ep_price_snapshots."""

    @staticmethod
    def upsert_markets(markets: list[dict]):
        """Bulk upsert to ep_markets_raw."""
        sb = get_supabase()
        sb.table("ep_markets_raw").upsert(markets, on_conflict="market_id").execute()

    @staticmethod
    def get_active_markets() -> list[dict]:
        sb = get_supabase()
        result = (
            sb.table("ep_markets_raw")
            .select("*")
            .eq("active", True)
            .order("volume", desc=True)
            .limit(200)
            .execute()
        )
        return result.data or []

    @staticmethod
    def get_market_by_id(market_id: str) -> dict | None:
        sb = get_supabase()
        result = (
            sb.table("ep_markets_raw")
            .select("*")
            .eq("market_id", market_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    @staticmethod
    def insert_snapshots(snapshots: list[dict]):
        sb = get_supabase()
        # Batch insert in chunks of 500
        for i in range(0, len(snapshots), 500):
            chunk = snapshots[i:i+500]
            sb.table("ep_price_snapshots").insert(chunk).execute()

    @staticmethod
    def get_price_history(market_id: str, hours: int = 48) -> list[dict]:
        sb = get_supabase()
        since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        result = (
            sb.table("ep_price_snapshots")
            .select("*")
            .eq("market_id", market_id)
            .gte("timestamp", since)
            .order("timestamp", desc=False)
            .execute()
        )
        return result.data or []


class OpportunityQueries:
    """CRUD for ep_detected_opportunities."""

    @staticmethod
    def insert_opportunity(opp: dict):
        sb = get_supabase()
        sb.table("ep_detected_opportunities").insert(opp).execute()

    @staticmethod
    def get_unprocessed(limit: int = 50) -> list[dict]:
        sb = get_supabase()
        result = (
            sb.table("ep_detected_opportunities")
            .select("*")
            .eq("processed", False)
            .order("detected_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    @staticmethod
    def mark_processed(opp_id: str):
        sb = get_supabase()
        sb.table("ep_detected_opportunities").update({"processed": True}).eq("id", opp_id).execute()

    @staticmethod
    def check_duplicate(market_id: str, signal_type: str) -> bool:
        """Check if this market+signal was already detected in the last 24h.
        Includes BOTH processed and unprocessed to prevent re-detection."""
        sb = get_supabase()
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        result = (
            sb.table("ep_detected_opportunities")
            .select("id")
            .eq("market_id", market_id)
            .eq("signal_type", signal_type)
            .gte("detected_at", since)
            .limit(1)
            .execute()
        )
        return len(result.data) > 0


class PickQueries:
    """CRUD for ep_curated_picks, ep_pick_results."""

    @staticmethod
    def insert_pick(pick: dict) -> dict | None:
        sb = get_supabase()
        result = sb.table("ep_curated_picks").insert(pick).execute()
        return result.data[0] if result.data else None

    @staticmethod
    def get_active_picks() -> list[dict]:
        sb = get_supabase()
        result = (
            sb.table("ep_curated_picks")
            .select("*")
            .eq("status", "active")
            .execute()
        )
        return result.data or []

    @staticmethod
    def get_pick_by_id(pick_id: str) -> dict | None:
        sb = get_supabase()
        result = (
            sb.table("ep_curated_picks")
            .select("*")
            .eq("id", pick_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    @staticmethod
    def close_pick(pick_id: str, status: str, exit_price: float):
        """Update pick status and insert result with PnL."""
        sb = get_supabase()
        now = datetime.now(timezone.utc).isoformat()

        # Update the pick
        sb.table("ep_curated_picks").update({
            "status": status,
            "closed_at": now,
        }).eq("id", pick_id).execute()

        # Fetch pick data for PnL calculation
        pick_result = sb.table("ep_curated_picks").select("*").eq("id", pick_id).limit(1).execute()
        p = pick_result.data[0] if pick_result.data else None
        if not p:
            return

        entry_price = float(p.get("entry_price", 0))
        direction = p.get("direction", "YES")

        # Calculate PnL
        if direction == "YES":
            pnl_pct = ((exit_price - entry_price) / max(entry_price, 0.001)) * 100
        else:
            pnl_pct = ((entry_price - exit_price) / max(entry_price, 0.001)) * 100

        pnl_absolute = pnl_pct  # Simplified: based on $1 notional per cent

        # Duration
        try:
            created_str = str(p.get("created_at", now)).replace("Z", "+00:00")
            created = datetime.fromisoformat(created_str)
        except Exception:
            created = datetime.now(timezone.utc)

        duration_hours = (datetime.now(timezone.utc) - created).total_seconds() / 3600

        sb.table("ep_pick_results").insert({
            "pick_id": pick_id,
            "entry_price": entry_price,
            "exit_price": exit_price,
            "pnl_percent": round(pnl_pct, 2),
            "pnl_absolute": round(pnl_absolute, 2),
            "duration_hours": round(duration_hours, 2),
            "exit_reason": status,
        }).execute()

    @staticmethod
    def get_recent_picks(limit: int = 10) -> list[dict]:
        sb = get_supabase()
        result = (
            sb.table("ep_curated_picks")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    @staticmethod
    def get_recent_market_ids(hours: int = 24) -> set[str]:
        """Return market_ids that already have picks created within the last N hours.
        Prevents the engine from re-picking the same market every cycle."""
        sb = get_supabase()
        since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        result = (
            sb.table("ep_curated_picks")
            .select("market_id")
            .gte("created_at", since)
            .execute()
        )
        return {r["market_id"] for r in (result.data or [])}


class TraderQueries:
    """CRUD for ep_tracked_traders, ep_trader_trades."""

    @staticmethod
    def upsert_trader(trader: dict) -> dict | None:
        sb = get_supabase()
        trader["last_updated"] = datetime.now(timezone.utc).isoformat()

        # Check if trader already exists by wallet_address
        existing = (
            sb.table("ep_tracked_traders")
            .select("id")
            .eq("wallet_address", trader["wallet_address"])
            .execute()
        )

        if existing.data:
            # Update only safe columns (avoids broken BEFORE UPDATE trigger)
            update_cols = {
                "alias": trader.get("alias"),
                "total_pnl": trader.get("total_pnl", 0),
                "pnl_30d": trader.get("pnl_30d", 0),
                "pnl_7d": trader.get("pnl_7d", 0),
                "win_rate": trader.get("win_rate", 0),
                "trade_count": trader.get("trade_count", 0),
                "composite_rank": trader.get("composite_rank", 0),
                "active": trader.get("active", True),
                "last_updated": trader.get("last_updated"),
                "roi": trader.get("roi", 0),
                "bankroll_tier": trader.get("bankroll_tier"),
                "trading_style": trader.get("trading_style"),
                "estimated_bankroll": trader.get("estimated_bankroll", 0),
                "markets_traded": trader.get("markets_traded", 0),
                "consistency_score": trader.get("consistency_score", 0),
                "avg_position_size": trader.get("avg_position_size", 0),
                "last_trade_date": trader.get("last_trade_date"),
                "category": trader.get("category"),
                "market_categories": trader.get("market_categories"),
            }
            # Remove None values to avoid overwriting existing data with null
            update_cols = {k: v for k, v in update_cols.items() if v is not None}
            try:
                result = (
                    sb.table("ep_tracked_traders")
                    .update(update_cols)
                    .eq("wallet_address", trader["wallet_address"])
                    .execute()
                )
                return result.data[0] if result.data else existing.data[0]
            except Exception:
                # Trigger error — skip update, data is still in DB
                return existing.data[0]
        else:
            # New trader — insert
            result = sb.table("ep_tracked_traders").insert(trader).execute()
            return result.data[0] if result.data else None

    @staticmethod
    def get_top_traders(limit: int = 5) -> list[dict]:
        sb = get_supabase()
        result = (
            sb.table("ep_tracked_traders")
            .select("*")
            .eq("active", True)
            .order("composite_rank", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    @staticmethod
    def get_top_traders_by_tier(top_per_tier: int = 5) -> list[dict]:
        """Get top traders from each bankroll tier for diverse coverage."""
        sb = get_supabase()
        tiers = ["whale", "mid", "small", "micro"]
        all_traders = []
        for tier in tiers:
            result = (
                sb.table("ep_tracked_traders")
                .select("*")
                .eq("active", True)
                .eq("bankroll_tier", tier)
                .order("composite_rank", desc=True)
                .limit(top_per_tier)
                .execute()
            )
            all_traders.extend(result.data or [])
        return all_traders

    @staticmethod
    def get_followed_custom_traders() -> list[dict]:
        """Get user-added custom traders that are actively followed."""
        sb = get_supabase()
        result = (
            sb.table("ep_tracked_traders")
            .select("*")
            .eq("active", True)
            .eq("source", "custom")
            .execute()
        )
        return result.data or []

    @staticmethod
    def get_trader_by_id(trader_id: str) -> dict | None:
        sb = get_supabase()
        result = sb.table("ep_tracked_traders").select("*").eq("id", trader_id).limit(1).execute()
        return result.data[0] if result.data else None

    @staticmethod
    def insert_trader_trade(trade: dict) -> dict | None:
        sb = get_supabase()
        result = sb.table("ep_trader_trades").insert(trade).execute()
        return result.data[0] if result.data else None


class AuditLog:
    """Insert to ep_audit_log."""

    @staticmethod
    def log(event_type: str, event_data: dict, source: str = ""):
        try:
            sb = get_supabase()
            sb.table("ep_audit_log").insert({
                "event_type": event_type,
                "event_data": event_data,
                "source": source,
            }).execute()
        except Exception:
            pass  # Never crash on audit logging
