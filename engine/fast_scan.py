#!/usr/bin/env python3
"""FAST trader scanner - profiles 20 traders concurrently."""

import asyncio
from shadow.trader_discovery import PolymarketClient, Category, TimePeriod, collect_trader_profile, compute_score, TraderQueries, log

async def scan():
    """Fast concurrent scan."""
    
    candidates = {}
    
    async with PolymarketClient() as client:
        log("info", "Fetching top 500 traders...", source="fast_scan")
        
        # Get leaderboard (fast)
        for offset in range(0, 500, 50):
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
        
        log("info", f"Found {len(candidates)} traders, profiling 20 at a time...", source="fast_scan")
        
        # Profile in batches of 20 (CONCURRENT)
        candidate_list = list(candidates.values())
        scored = []
        
        async def profile_one(cand, idx):
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
                    log("info", f"[{idx}] ✅ {score.username}: {score.composite_score:.0f}/100", source="fast_scan")
                    return score
                else:
                    log("debug", f"[{idx}] ❌ {score.username}: {score.disqualify_reason}", source="fast_scan")
                    return None
            except Exception as e:
                log("warning", f"[{idx}] Failed: {e}", source="fast_scan")
                return None
        
        # Process in batches of 20
        batch_size = 20
        for i in range(0, len(candidate_list), batch_size):
            batch = candidate_list[i:i+batch_size]
            tasks = [profile_one(cand, i+j+1) for j, cand in enumerate(batch)]
            results = await asyncio.gather(*tasks)
            scored.extend([r for r in results if r])
            log("info", f"Progress: {min(i+batch_size, len(candidate_list))}/{len(candidate_list)} | Qualified: {len(scored)}", source="fast_scan")
        
        # Save to DB
        log("info", f"Saving {len(scored)} traders...", source="fast_scan")
        
        from shadow.trader_discovery import TraderDiscovery
        td = TraderDiscovery()
        
        for s in scored:
            try:
                trader_dict = td._score_to_dict(s)
                TraderQueries.upsert_trader(trader_dict)
            except Exception as e:
                log("warning", f"Save failed: {e}", source="fast_scan")
        
        log("info", f"✅ DONE! {len(scored)} traders in database", source="fast_scan")
        return scored

if __name__ == "__main__":
    asyncio.run(scan())
