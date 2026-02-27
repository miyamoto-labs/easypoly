#!/usr/bin/env python3
"""
Simple trader scanner that ACTUALLY WORKS.
Uses leaderboard pagination - gets top 500 from each category.
"""

import asyncio
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent))

from shadow.trader_discovery import TraderDiscovery, Category, TimePeriod
from utils.logger import log

async def main():
    """Run simple leaderboard-based discovery with pagination."""
    
    log("info", "🚀 Starting SIMPLE trader discovery (leaderboard pagination)...", source="scanner")
    log("info", "📊 Will pull top 500 from multiple leaderboards", source="scanner")
    log("info", "⏱️  Estimated time: 10-15 minutes", source="scanner")
    
    # Use the ORIGINAL trader_discovery.py (not v2) with higher top_n
    scanner = TraderDiscovery(
        top_n=500,  # Get top 500 instead of 50
        categories=[
            Category.OVERALL,
            Category.POLITICS, 
            Category.SPORTS,
            Category.CRYPTO,
        ],
        time_periods=[
            TimePeriod.ALL,
            TimePeriod.MONTH,
            TimePeriod.WEEK,
        ]
    )
    
    # Run discovery
    traders = await scanner.scan_all()
    
    log("info", f"✅ Discovery complete! Found {len(traders)} traders", source="scanner")
    
    # Show breakdown
    tiers = {}
    for t in traders:
        tier = t.get("tier", "unknown")
        tiers[tier] = tiers.get(tier, 0) + 1
    
    log("info", f"Tier breakdown: {tiers}", source="scanner")
    
    return traders

if __name__ == "__main__":
    asyncio.run(main())
