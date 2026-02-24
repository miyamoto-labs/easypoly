"""Simple logging with timestamps."""
import sys
from datetime import datetime

def log(level: str, message: str, source: str = "", audit: bool = False):
    ts = datetime.now().strftime("%H:%M:%S")
    prefix = f"[{source}] " if source else ""
    print(f"{ts} [{level.upper()}] {prefix}{message}", flush=True)

    if audit:
        try:
            from db.queries import AuditLog
            AuditLog.log(level, {"message": message}, source=source)
        except Exception:
            pass
