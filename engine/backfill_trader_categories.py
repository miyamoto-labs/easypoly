#!/usr/bin/env python3
"""
One-off script: Categorize active traders by keyword-matching their trade titles.
No extra API calls to Gamma — just fetches recent trades and classifies by title.
"""
import asyncio
import httpx
from collections import Counter
from db.client import get_supabase

DATA_API = "https://data-api.polymarket.com"

# Same keywords as in trader_discovery.py
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


def classify_title(title: str) -> str:
    text = title.lower()
    scores = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        scores[category] = sum(1 for kw in keywords if kw in text)
    if max(scores.values()) == 0:
        return "other"
    return max(scores, key=scores.get)


async def get_trader_category(client: httpx.AsyncClient, wallet: str) -> tuple[str, list[str]]:
    """Fetch recent trades and classify by title keywords."""
    try:
        resp = await client.get(
            f"{DATA_API}/trades",
            params={"user": wallet, "limit": 20},
            timeout=15,
        )
        if resp.status_code != 200:
            return "other", []

        trades = resp.json()
        if not trades or not isinstance(trades, list):
            return "other", []

        # Classify each unique market title
        seen_slugs = set()
        categories = []
        for t in trades:
            slug = t.get("eventSlug", "")
            if slug in seen_slugs:
                continue
            seen_slugs.add(slug)
            title = t.get("title", "")
            if title:
                categories.append(classify_title(title))

        if not categories:
            return "other", []

        counts = Counter(categories)
        unique_cats = [c for c in set(categories) if c != "other"]

        # Prefer non-"other" categories as primary
        non_other = {k: v for k, v in counts.items() if k != "other"}
        if non_other:
            primary = max(non_other, key=non_other.get)
        else:
            primary = "other"

        return primary, unique_cats

    except Exception as e:
        print(f"  Error: {e}")
        return "other", []


async def main():
    sb = get_supabase()
    result = sb.table("ep_tracked_traders").select("id, wallet_address, alias").eq("active", True).execute()
    traders = result.data or []
    print(f"Categorizing {len(traders)} active traders...\n")

    distribution = Counter()

    async with httpx.AsyncClient() as client:
        for i, trader in enumerate(traders):
            wallet = trader["wallet_address"]
            alias = trader.get("alias") or wallet[:10]

            await asyncio.sleep(0.2)
            primary, all_cats = await get_trader_category(client, wallet)

            cat_value = primary if primary != "other" else None
            sb.table("ep_tracked_traders").update({
                "category": cat_value,
                "market_categories": all_cats,
            }).eq("id", trader["id"]).execute()

            distribution[primary] += 1
            print(f"  [{i+1}/{len(traders)}] {alias:25s} → {primary:10s} {all_cats}")

    print(f"\n{'='*50}")
    print("Category distribution:")
    for cat, count in distribution.most_common():
        pct = count / len(traders) * 100
        print(f"  {cat:15s}: {count:4d} ({pct:.0f}%)")
    print(f"  {'TOTAL':15s}: {len(traders)}")


if __name__ == "__main__":
    asyncio.run(main())
