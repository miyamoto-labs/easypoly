"""Rate limiter for API calls."""
import time
import threading

class RateLimiter:
    def __init__(self):
        self._locks = {}
        self._last_call = {}
        self._intervals = {
            "polymarket": 0.5,
            "anthropic": 1.0,
            "perplexity": 1.0,
            "default": 0.3,
        }

    def wait(self, service: str = "default"):
        interval = self._intervals.get(service, self._intervals["default"])
        now = time.time()
        last = self._last_call.get(service, 0)
        wait_time = interval - (now - last)
        if wait_time > 0:
            time.sleep(wait_time)
        self._last_call[service] = time.time()

rate_limiter = RateLimiter()
