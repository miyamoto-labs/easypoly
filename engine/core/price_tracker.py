"""Price Tracker — Inserts price snapshots for all tracked markets."""
from db.queries import MarketQueries
from utils.logger import log


class PriceTracker:
    def snapshot_all(self, markets: list[dict]) -> int:
        """Insert price snapshots for all markets."""
        snapshots = []
        for m in markets:
            for outcome in ["YES", "NO"]:
                price = m.get("yes_price", 0.5) if outcome == "YES" else m.get("no_price", 0.5)
                snapshots.append({
                    "market_id": m["market_id"],
                    "outcome": outcome,
                    "price": price,
                    "volume": m.get("volume", 0),
                    "liquidity": m.get("liquidity", 0),
                })

        if snapshots:
            MarketQueries.insert_snapshots(snapshots)
            log("info", f"Inserted {len(snapshots)} price snapshots for {len(markets)} markets", source="price_tracker")

        return len(snapshots)
