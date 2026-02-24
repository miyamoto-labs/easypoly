"""
Trader Scanner — Backward-compatible wrapper around TraderDiscovery.

The deep discovery engine (trader_discovery.py) replaces the old shallow scanner.
This wrapper preserves the TraderScanner interface so existing imports in
run.py and copy_detector.py continue to work.
"""
from __future__ import annotations

import asyncio
from shadow.trader_discovery import TraderDiscovery


class TraderScanner:
    """Backward-compatible wrapper — delegates to TraderDiscovery."""

    def scan_all(self) -> list[dict]:
        """Run the deep discovery pipeline (sync wrapper for async engine)."""
        discovery = TraderDiscovery()
        # Run the async scan_all in the current event loop if one exists,
        # otherwise create a new one
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            # We're inside an async context — create a task
            # This shouldn't normally happen since run.py calls us from async
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return loop.run_in_executor(pool, lambda: asyncio.run(discovery.scan_all()))
        else:
            return asyncio.run(discovery.scan_all())
