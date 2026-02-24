"""
Standing Order Trigger — Notifies the Next.js app to execute standing orders for new picks.
Called after picks are broadcast to Telegram in the main pipeline.
"""
import aiohttp

from config import EASYPOLY_APP_URL, INTERNAL_API_SECRET
from utils.logger import log


async def trigger_standing_orders(picks: list[dict]) -> dict:
    """
    POST to /api/standing-orders/execute with the new picks.
    Returns the response from the app.
    """
    if not picks:
        return {"skipped": True, "reason": "no_picks"}

    if not INTERNAL_API_SECRET:
        log("warning", "INTERNAL_API_SECRET not set — skipping standing orders trigger", source="standing_order_trigger")
        return {"skipped": True, "reason": "no_api_secret"}

    payload = {
        "picks": [{
            "id": p.get("id", ""),
            "market_id": p.get("market_id", ""),
            "direction": p.get("direction", ""),
            "conviction_score": p.get("conviction_score", 0),
            "entry_price": p.get("entry_price", 0),
            "category": p.get("category", ""),
        } for p in picks]
    }

    url = f"{EASYPOLY_APP_URL}/api/standing-orders/execute"

    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(
                url,
                json=payload,
                headers={
                    "x-api-key": INTERNAL_API_SECRET,
                    "Content-Type": "application/json",
                },
                timeout=aiohttp.ClientTimeout(total=30),
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    processed = data.get("processed", 0)
                    log("info",
                        f"Standing orders executed for {processed} picks",
                        source="standing_order_trigger")
                    return data
                else:
                    text = await response.text()
                    log("warning",
                        f"Standing orders trigger failed ({response.status}): {text[:200]}",
                        source="standing_order_trigger")
                    return {"error": True, "status": response.status, "message": text[:200]}

        except Exception as e:
            log("warning", f"Standing orders trigger error: {e}", source="standing_order_trigger")
            return {"error": True, "message": str(e)}
