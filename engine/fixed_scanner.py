#!/usr/bin/env python3
"""
FIXED scanner: Uses v2 scoring (with time-based metrics) + simple leaderboard pagination.
"""

import asyncio
from shadow.trader_discovery_v2 import (
    PolymarketClient, 
    Category, 
    TimePeriod, 
    collect_trader_profile, 
    compute_score,  # THIS is the v2 version with lifecycle/rising star
    TraderQueries,
    log
)

async def scan():
    """Scan with v2 scoring that includes 7d/30d P&L, lifecycle, rising stars."""
    
    candidates = {}
    
    async with PolymarketClient() as client:
        log("info", "Fetching top 500 traders (using V2 SCORING)...", source="fixed_scan")
        
        # Get leaderboard
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
        
        log("info", f"Found {len(candidates)} traders, profiling with V2 scoring (20 concurrent)...", source="fixed_scan")
        
        scored = []
        candidate_list = list(candidates.values())
        
        async def profile_one(cand, idx):
            try:
                # Collect profile (this fetches trade history with timestamps)
                profile = await collect_trader_profile(
                    client,
                    address=cand["address"],
                    username=cand["username"],
                    profile_image=cand["profile_image"],
                    rank=cand["rank"],
                    pnl=cand["pnl"],
                    vol=cand["vol"],
                )
                
                # V2 compute_score - includes lifecycle & rising star detection
                score = compute_score(profile)
                
                if not score.disqualified:
                    log("info", 
                        f"[{idx}] ✅ {score.username}: {score.composite_score:.0f}/100 "
                        f"| {score.lifecycle_state.upper()} "
                        f"{'⭐' if score.rising_star else ''}", 
                        source="fixed_scan")
                    return score
                else:
                    log("debug", f"[{idx}] ❌ {score.username}: {score.disqualify_reason}", source="fixed_scan")
                    return None
            except Exception as e:
                log("warning", f"[{idx}] Failed: {e}", source="fixed_scan")
                return None
        
        # Process in batches of 20
        batch_size = 20
        for i in range(0, len(candidate_list), batch_size):
            batch = candidate_list[i:i+batch_size]
            tasks = [profile_one(cand, i+j+1) for j, cand in enumerate(batch)]
            results = await asyncio.gather(*tasks)
            scored.extend([r for r in results if r])
            
            # Count lifecycle states
            hot = sum(1 for r in results if r and r.lifecycle_state == "hot")
            rising = sum(1 for r in results if r and r.rising_star)
            
            log("info", 
                f"Progress: {min(i+batch_size, len(candidate_list))}/{len(candidate_list)} "
                f"| Qualified: {len(scored)} | Hot: {hot} | Rising Stars: {rising}", 
                source="fixed_scan")
        
        # Save to DB
        log("info", f"Saving {len(scored)} traders...", source="fixed_scan")
        
        from shadow.trader_discovery_v2 import TraderDiscovery
        td = TraderDiscovery()
        
        for s in scored:
            try:
                trader_dict = td._score_to_dict(s)
                TraderQueries.upsert_trader(trader_dict)
            except Exception as e:
                log("warning", f"Save failed for {s.username}: {e}", source="fixed_scan")
        
        # Stats
        lifecycles = {}
        rising_count = 0
        for s in scored:
            lifecycles[s.lifecycle_state] = lifecycles.get(s.lifecycle_state, 0) + 1
            if s.rising_star:
                rising_count += 1
        
        log("info", f"✅ DONE! {len(scored)} traders | Lifecycle: {lifecycles} | Rising Stars: {rising_count}", source="fixed_scan")
        return scored

if __name__ == "__main__":
    asyncio.run(scan())
