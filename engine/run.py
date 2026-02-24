#!/usr/bin/env python3
"""
EasyPoly Headless Engine — Main entry point.

Runs an infinite loop:
1. Resolve active picks (check for W/L/stop/target/expiry)
2. Scan Polymarket for new markets
3. Snapshot prices
4. Detect opportunities (4 signal types)
5. Score with Claude (conviction engine)
6. Broadcast picks to @EasyPolyBot via API
7. Shadow cycle (scan traders, detect copy signals)
8. Sleep 5 minutes, repeat
"""
import asyncio
import sys
import argparse
from datetime import datetime, timezone

from config import CONVICTION_CONFIG
from utils.logger import log

# Track last discovery run — only run every 6 hours
_last_discovery_run: datetime | None = None
DISCOVERY_INTERVAL_HOURS = 6


async def run_resolution_check():
    """Check active picks for resolution."""
    from core.pick_resolver import PickResolver
    resolver = PickResolver()
    return resolver.resolve_all()


async def run_scan_cycle():
    """Full scan → detect → score cycle."""
    from core.market_scanner import MarketScanner
    from core.price_tracker import PriceTracker
    from core.opportunity_detector import OpportunityDetector
    from analyst.conviction_engine import ConvictionEngine

    # 1. Scan markets
    scanner = MarketScanner()
    markets = scanner.scan()
    log("info", f"Scanned {len(markets)} markets", source="run")

    # 2. Sync to Supabase
    scanner.sync_to_supabase(markets)

    # 3. Snapshot prices
    tracker = PriceTracker()
    tracker.snapshot_all(markets)

    # 4. Detect opportunities
    detector = OpportunityDetector()
    opps = detector.scan_all(markets)
    log("info", f"Detected {len(opps)} opportunities", source="run")

    # 5. Score with Claude
    engine = ConvictionEngine()
    picks = engine.score_opportunities()
    log("info", f"Produced {len(picks)} curated picks", source="run")

    return picks


async def run_shadow_cycle():
    """Scan traders and detect copy signals."""
    from shadow.trader_discovery import TraderDiscovery
    from shadow.copy_detector import CopyDetector

    discovery = TraderDiscovery()
    traders = await discovery.scan_all()
    log("info", f"Shadow: tracked {len(traders)} traders", source="run")

    detector = CopyDetector(max_traders=10)
    signals = detector.detect_signals()
    if signals:
        log("info", f"Shadow: {len(signals)} copy signals detected", source="run")

    return traders, signals


async def run_full_pipeline():
    """Run the complete pipeline once."""
    # Step 1: Resolve existing picks
    resolution = await run_resolution_check()
    log("info", f"Resolution check: {resolution}", source="run")

    # Step 2: Scan + detect + score
    log("info", "Starting scan cycle", source="run")
    picks = await run_scan_cycle()

    # Step 3: Broadcast new picks
    if picks:
        from analyst.api_broadcaster import ApiBroadcaster
        broadcaster = ApiBroadcaster()
        sent = await broadcaster.broadcast_picks(picks)
        log("info", f"Broadcast {sent} pick messages via API", source="run")

    # Step 4: Shadow cycle (trader discovery every 6h, copy detection every cycle)
    global _last_discovery_run
    now = datetime.now(timezone.utc)
    hours_since = (now - _last_discovery_run).total_seconds() / 3600 if _last_discovery_run else float("inf")

    if hours_since >= DISCOVERY_INTERVAL_HOURS:
        try:
            await run_shadow_cycle()
            _last_discovery_run = now
        except Exception as e:
            log("warning", f"Shadow cycle error: {e}", source="run")
    else:
        log("info", f"Skipping trader discovery ({hours_since:.1f}h since last run, interval={DISCOVERY_INTERVAL_HOURS}h)", source="run")

    return picks


async def main_loop():
    """Infinite loop: resolution every 5 min, full scan every 6 hours."""
    scan_interval = CONVICTION_CONFIG.get("scan_interval_minutes", 360) * 60  # 6h default
    resolve_interval = 5 * 60  # Resolution checks every 5 minutes
    _last_scan: datetime | None = None
    log("info", f"Starting headless engine (scan every {scan_interval // 3600}h, resolve every {resolve_interval // 60}m)", source="run")

    while True:
        try:
            now = datetime.now(timezone.utc)
            hours_since_scan = (now - _last_scan).total_seconds() / 3600 if _last_scan else float("inf")

            if hours_since_scan >= scan_interval / 3600:
                # Full pipeline: resolve + scan + score + broadcast + shadow
                log("info", "Running full scan pipeline", source="run")
                await run_full_pipeline()
                _last_scan = datetime.now(timezone.utc)
            else:
                # Quick cycle: just resolve active picks
                log("info", f"Resolution check (next scan in {scan_interval / 3600 - hours_since_scan:.1f}h)", source="run")
                resolution = await run_resolution_check()
                log("info", f"Resolution check: {resolution}", source="run")
        except Exception as e:
            log("error", f"Pipeline error: {e}", source="run")

        log("info", f"Sleeping {resolve_interval}s until next check", source="run")
        await asyncio.sleep(resolve_interval)


def main():
    parser = argparse.ArgumentParser(description="EasyPoly Headless Engine")
    parser.add_argument("--scan-only", action="store_true", help="Run one scan cycle and exit")
    parser.add_argument("--resolve-only", action="store_true", help="Run resolution check and exit")
    parser.add_argument("--shadow-only", action="store_true", help="Run shadow cycle and exit")
    args = parser.parse_args()

    if args.scan_only:
        asyncio.run(run_scan_cycle())
    elif args.resolve_only:
        asyncio.run(run_resolution_check())
    elif args.shadow_only:
        asyncio.run(run_shadow_cycle())
    else:
        asyncio.run(main_loop())


if __name__ == "__main__":
    main()
