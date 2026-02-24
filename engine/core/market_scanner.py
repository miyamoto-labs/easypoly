"""
Market Scanner - Discover and filter Polymarket markets
"""
from __future__ import annotations

import requests
import time
from typing import List, Dict, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from config import GAMMA_API, CLOB_HOST


@dataclass
class Market:
    """Represents a Polymarket market"""
    slug: str
    question: str
    yes_token: str
    no_token: str
    end_date: datetime
    volume: float
    liquidity: float
    yes_price: float
    no_price: float
    category: str
    description: str = ""
    
    @property
    def hours_to_resolution(self) -> float:
        """Hours until market resolves"""
        delta = self.end_date - datetime.now(timezone.utc)
        return delta.total_seconds() / 3600
    
    @property
    def is_near_term(self) -> bool:
        """Market resolves within 72 hours"""
        return self.hours_to_resolution <= 72
    
    @property
    def is_high_confidence(self) -> bool:
        """One side has >95% probability"""
        return self.yes_price >= 0.95 or self.no_price >= 0.95


class MarketScanner:
    """
    Scan and filter Polymarket markets
    """
    
    def __init__(self):
        self.cache = {}
        self.cache_ttl = 60  # Cache for 60 seconds
        self.last_scan = 0
    
    def get_all_markets(self, limit: int = 500) -> List[Market]:
        """
        Fetch all active markets with pagination.

        Args:
            limit: Target number of markets to return

        Returns:
            List of Market objects
        """
        try:
            # Check cache
            cache_key = "all_markets"
            if cache_key in self.cache:
                cached_time, cached_data = self.cache[cache_key]
                if time.time() - cached_time < self.cache_ttl:
                    return cached_data

            markets = []
            page_size = 100  # Gamma API max per page
            offset = 0

            while len(markets) < limit:
                url = f"{GAMMA_API}/markets"
                params = {
                    "limit": page_size,
                    "offset": offset,
                    "closed": False,  # Only active markets
                    "active": True,
                    "_sort": "-volume24hr"  # Sort by volume
                }

                response = requests.get(url, params=params, timeout=15)
                response.raise_for_status()

                markets_data = response.json()
                if not markets_data:
                    break  # No more markets

                for m in markets_data:
                    try:
                        market = self._parse_market(m)
                        if market:
                            markets.append(market)
                    except Exception as e:
                        continue

                offset += page_size

                # If we got fewer than page_size, we've reached the end
                if len(markets_data) < page_size:
                    break

            # Cache results
            self.cache[cache_key] = (time.time(), markets)

            print(f"✅ Scanned {len(markets)} active markets")
            return markets

        except Exception as e:
            print(f"❌ Error scanning markets: {e}")
            return []
    
    def _parse_market(self, data: Dict) -> Optional[Market]:
        """Parse market data from API"""
        try:
            import json as json_lib
            
            # Extract token IDs from clobTokenIds (JSON string)
            token_ids_str = data.get("clobTokenIds", "[]")
            try:
                token_ids = json_lib.loads(token_ids_str)
            except:
                return None
            
            if len(token_ids) < 2:
                return None
            
            yes_token = token_ids[0]
            no_token = token_ids[1]
            
            # Parse end date (endDate, not end_date_iso)
            end_date_str = data.get("endDate")
            if not end_date_str:
                return None
            end_date = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
            
            # Get prices from outcomePrices (JSON string)
            prices_str = data.get("outcomePrices", "[0.5, 0.5]")
            try:
                prices = json_lib.loads(prices_str)
                yes_price = float(prices[0]) if prices else 0.5
                no_price = float(prices[1]) if len(prices) > 1 else 0.5
            except:
                yes_price = 0.5
                no_price = 0.5
            
            return Market(
                slug=data.get("slug", ""),
                question=data.get("question", ""),
                yes_token=yes_token,
                no_token=no_token,
                end_date=end_date,
                volume=float(data.get("volume", 0)),
                liquidity=float(data.get("liquidity", 0)),
                yes_price=yes_price,
                no_price=no_price,
                category=data.get("category", "other"),
                description=data.get("description", "")
            )
        
        except Exception as e:
            print(f"⚠️ Error parsing market: {e}")
            return None
    
    def filter_crypto_markets(self, markets: List[Market]) -> List[Market]:
        """Filter for crypto-related markets"""
        keywords = ["bitcoin", "btc", "ethereum", "eth", "crypto", "blockchain", 
                   "defi", "nft", "token", "coin", "binance", "coinbase"]
        
        return [m for m in markets if any(kw in m.question.lower() for kw in keywords)]
    
    def filter_high_volume(self, markets: List[Market], min_volume: float = 10000) -> List[Market]:
        """Filter for high-volume markets"""
        return [m for m in markets if m.volume >= min_volume]
    
    def filter_near_resolution(self, markets: List[Market], max_hours: float = 72) -> List[Market]:
        """Filter for markets resolving soon"""
        return [m for m in markets if m.hours_to_resolution <= max_hours]
    
    def filter_high_confidence(self, markets: List[Market], min_prob: float = 0.95) -> List[Market]:
        """Filter for near-certain outcomes (bond opportunities)"""
        return [m for m in markets if m.yes_price >= min_prob or m.no_price >= min_prob]
    
    def filter_mispriced(self, markets: List[Market], max_sum: float = 0.98, min_sum: float = 1.02) -> List[Market]:
        """Filter for probability sum anomalies"""
        return [m for m in markets if (m.yes_price + m.no_price) < max_sum or 
                                       (m.yes_price + m.no_price) > min_sum]
    
    def get_orderbook(self, token_id: str) -> Dict:
        """
        Get orderbook for a token
        
        Returns:
            {"best_bid": float, "best_ask": float, "spread": float}
        """
        try:
            url = f"{CLOB_HOST}/book"
            response = requests.get(url, params={"token_id": token_id}, timeout=5)
            response.raise_for_status()
            
            book = response.json()
            bids = book.get("bids", [])
            asks = book.get("asks", [])
            
            best_bid = float(bids[0]["price"]) if bids else 0.0
            best_ask = float(asks[0]["price"]) if asks else 1.0
            
            return {
                "best_bid": best_bid,
                "best_ask": best_ask,
                "spread": best_ask - best_bid,
                "bid_size": float(bids[0]["size"]) if bids else 0.0,
                "ask_size": float(asks[0]["size"]) if asks else 0.0
            }
        
        except Exception as e:
            print(f"⚠️ Error fetching orderbook: {e}")
            return {"best_bid": 0, "best_ask": 1.0, "spread": 1.0}
    
    def scan(self, limit: int = 200) -> list[dict]:
        """
        Scan markets and return as dicts for the EasyPoly pipeline.
        Bridge between the original Market dataclass and the dict-based pipeline.
        """
        markets = self.get_all_markets(limit=limit)
        return [
            {
                "market_id": m.slug,
                "question": m.question,
                "yes_token": m.yes_token,
                "no_token": m.no_token,
                "end_date": m.end_date.isoformat() if m.end_date else None,
                "volume": m.volume,
                "liquidity": m.liquidity,
                "yes_price": m.yes_price,
                "no_price": m.no_price,
                "category": m.category,
                "description": m.description,
                "active": True,
            }
            for m in markets
        ]

    def sync_to_supabase(self, markets: list[dict]) -> None:
        """Upsert scanned markets to Supabase."""
        try:
            from db.queries import MarketQueries
            MarketQueries.upsert_markets(markets)
            from utils.logger import log
            log("info", f"Synced {len(markets)} markets to Supabase", source="market_scanner")
        except Exception as e:
            from utils.logger import log
            log("warning", f"Failed to sync markets: {e}", source="market_scanner")

    def get_market_details(self, slug: str) -> Optional[Market]:
        """Get details for a specific market"""
        try:
            url = f"{GAMMA_API}/markets"
            response = requests.get(url, params={"slug": slug}, timeout=5)
            response.raise_for_status()
            
            markets = response.json()
            if markets:
                return self._parse_market(markets[0])
            return None
        
        except Exception as e:
            print(f"❌ Error fetching market details: {e}")
            return None


# ============================================================================
# CLI TESTING
# ============================================================================

if __name__ == "__main__":
    scanner = MarketScanner()
    
    print("\n" + "="*70)
    print("🔍 MARKET SCANNER TEST")
    print("="*70)
    
    # Scan all markets
    markets = scanner.get_all_markets(limit=50)
    print(f"\n✅ Found {len(markets)} active markets")
    
    # Filter crypto markets
    crypto = scanner.filter_crypto_markets(markets)
    print(f"📊 Crypto markets: {len(crypto)}")
    
    # Filter high confidence (bonds)
    bonds = scanner.filter_high_confidence(markets)
    print(f"💰 Bond opportunities: {len(bonds)}")
    
    # Show top 5 markets
    print("\n🔥 Top 5 Markets by Volume:")
    for i, market in enumerate(markets[:5], 1):
        print(f"\n{i}. {market.question[:70]}...")
        print(f"   YES: {market.yes_price:.2%} | NO: {market.no_price:.2%}")
        print(f"   Volume: ${market.volume:,.0f} | Liquidity: ${market.liquidity:,.0f}")
        print(f"   Resolves: {market.hours_to_resolution:.1f}h")
    
    print("\n" + "="*70)
