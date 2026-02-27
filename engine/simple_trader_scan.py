#!/usr/bin/env python3
"""Dead simple trader scanner using Polymarket leaderboards with PAGINATION."""

import asyncio
from shadow.trader_discovery import PolymarketClient, Category, TimePeriod, collect_trader_profile, compute_score, TraderQueries, log

async def scan():
    """Scan leaderboards with pagination - get 500 traders total."""
    
    candidates = {}
    
    async with PolymarketClient() as client:
        # Get top 500 from OVERALL leaderboard (10 pages x 50)
        log("info", "Fetching top 500 traders from leaderboards...", source="scanner")
        
        for offset in range(0, 500, 50):
            try:
                entries = await client.get_leaderboard(
                    category=Category.OVERALL,
                    time_period=TimePeriod.ALL,
                    order_by="PNL",
                    limit=50,
                    offset=offset
                )
                
                if not entries:
                    break
                    
                for entry in entries:
                    addr = entry.get("proxyWallet", "")
                    if addr and addr not in candidates:
                        candidates[addr] = {
                            "address": addr,
                            "username": entry.get("userName", ""),
                            "profile_image": entry.get("profileImage", ""),
                            "rank": int(entry.get("rank", 0)),
                            "pnl": float(entry.get("pnl", 0)),
                            "vol": float(entry.get("vol", 0)),
                        }
                
                log("info", f"Fetched offset {offset}, total unique: {len(candidates)}", source="scanner")
                
            except Exception as e:
                log("warning", f"Failed at offset {offset}: {e}", source="scanner")
                continue
        
        log("info", f"Found {len(candidates)} unique traders, profiling...", source="scanner")
        
        # Profile and score each trader
        scored = []
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
                
                score = compute_score(profile)
                
                if not score.disqualified:
                    scored.append(score)
                    log("info", f"[{i+1}/{len(candidate_list)}] ✅ {score.username}: {score.composite_score:.0f}/100", source="scanner")
                else:
                    log("debug", f"[{i+1}/{len(candidate_list)}] ❌ {score.username}: {score.disqualify_reason}", source="scanner")
                    
                if (i + 1) % 10 == 0:
                    log("info", f"Progress: {i+1}/{len(candidate_list)} profiled", source="scanner")
                    
            except Exception as e:
                log("warning", f"Failed to profile {cand.get('username')}: {e}", source="scanner")
                continue
        
        # Save to DB
        log("info", f"Saving {len(scored)} qualified traders to database...", source="scanner")
        
        from shadow.trader_discovery import TraderDiscovery
        td = TraderDiscovery()
        
        saved = 0
        for s in scored:
            try:
                trader_dict = td._score_to_dict(s)
                TraderQueries.upsert_trader(trader_dict)
                saved += 1
            except Exception as e:
                log("warning", f"Failed to save {s.username}: {e}", source="scanner")
        
        log("info", f"✅ Saved {saved} traders to database!", source="scanner")
        
        # Show breakdown
        tiers = {}
        for s in scored:
            tiers[s.tier] = tiers.get(s.tier, 0) + 1
        
        log("info", f"Tier breakdown: {tiers}", source="scanner")
        
        return scored

if __name__ == "__main__":
    asyncio.run(scan())
