#!/usr/bin/env python3
"""
One-off script: Backfill last_trade_date for all active traders.
Fetches latest trade timestamp from Polymarket API and updates DB.
Deactivates traders with no trade in 30+ days.
"""
import asyncio
import httpx
from datetime import datetime, timezone
from db.client import get_supabase

DATA_API = "https://data-api.polymarket.com"
MIN_DAYS_SINCE_LAST_TRADE = 30


async def get_latest_trade_date(client: httpx.AsyncClient, wallet: str) -> datetime | None:
    """Fetch the most recent trade timestamp for a wallet."""
    try:
        resp = await client.get(
            f"{DATA_API}/trades",
            params={"user": wallet, "limit": 1},
            timeout=15,
        )
        if resp.status_code == 200:
            trades = resp.json()
            if trades and isinstance(trades, list) and len(trades) > 0:
                ts = trades[0].get("timestamp") or trades[0].get("createdAt")
                if ts is None:
                    return None
                # Handle both int (unix) and string (ISO) timestamps
                if isinstance(ts, (int, float)):
                    return datetime.fromtimestamp(ts, tz=timezone.utc)
                else:
                    return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except Exception as e:
        print(f"  Error fetching trades for {wallet[:10]}: {e}")
    return None


async def main():
    sb = get_supabase()

    # First: re-activate ALL traders (undo the broken first run)
    print("Re-activating all traders first...")
    sb.table("ep_tracked_traders").update({"active": True}).neq("source", "user_added").execute()

    # Get all active traders
    result = sb.table("ep_tracked_traders").select("id, wallet_address, alias, active").eq("active", True).execute()
    traders = result.data or []
    print(f"Found {len(traders)} active traders to backfill\n")

    updated = 0
    deactivated = 0
    no_trades = 0
    now = datetime.now(timezone.utc)

    async with httpx.AsyncClient() as client:
        for i, trader in enumerate(traders):
            wallet = trader["wallet_address"]
            alias = trader.get("alias") or wallet[:10]

            # Rate limit
            await asyncio.sleep(0.3)

            last_trade = await get_latest_trade_date(client, wallet)

            if last_trade is None:
                print(f"  [{i+1}/{len(traders)}] {alias:20s} — no trades found")
                no_trades += 1
                # Deactivate if we can't find any trades
                sb.table("ep_tracked_traders").update({
                    "active": False,
                    "last_trade_date": None,
                }).eq("id", trader["id"]).execute()
                deactivated += 1
                continue

            days_since = (now - last_trade).total_seconds() / 86400

            if days_since > MIN_DAYS_SINCE_LAST_TRADE:
                print(f"  [{i+1}/{len(traders)}] {alias:20s} — last trade {days_since:.0f}d ago → DEACTIVATED")
                sb.table("ep_tracked_traders").update({
                    "active": False,
                    "last_trade_date": last_trade.isoformat(),
                }).eq("id", trader["id"]).execute()
                deactivated += 1
            else:
                print(f"  [{i+1}/{len(traders)}] {alias:20s} — last trade {days_since:.1f}d ago ✓")
                sb.table("ep_tracked_traders").update({
                    "last_trade_date": last_trade.isoformat(),
                }).eq("id", trader["id"]).execute()
                updated += 1

    print(f"\n{'='*50}")
    print(f"Backfill complete:")
    print(f"  Active (traded <30d):  {updated}")
    print(f"  Deactivated (>30d):    {deactivated}")
    print(f"  No trades found:       {no_trades}")
    print(f"  Total:                 {len(traders)}")


if __name__ == "__main__":
    asyncio.run(main())
