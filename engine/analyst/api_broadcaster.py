"""
API Broadcaster — Posts curated picks to the production @EasyPolyBot via its /broadcast endpoint.
"""
import requests
from datetime import datetime, timezone

from config import EASYPOLY_BOT_URL, EASYPOLY_BOT_API_SECRET
from db.queries import MarketQueries
from utils.logger import log


class ApiBroadcaster:
    def __init__(self):
        self.base_url = EASYPOLY_BOT_URL
        self.api_secret = EASYPOLY_BOT_API_SECRET

    async def broadcast_picks(self, picks: list[dict]) -> int:
        """Broadcast picks to the bot's /broadcast endpoint."""
        if not picks:
            return 0

        sent = 0
        for pick in picks:
            try:
                market = MarketQueries.get_market_by_id(pick["market_id"])
                question = market.get("question", pick["market_id"]) if market else pick["market_id"]

                payload = {
                    "picks": [{
                        "question": question,
                        "slug": pick["market_id"],
                        "side": pick["direction"],
                        "price": pick.get("entry_price", 0),
                        "confidence": self._score_to_confidence(pick.get("conviction_score", 0)),
                        "reasoning": pick.get("telegram_summary", pick.get("edge_explanation", "")),
                        "tokenId": market.get("yes_token", "") if market and pick["direction"] == "YES" else (market.get("no_token", "") if market else ""),
                        "createdAt": datetime.now(timezone.utc).isoformat(),
                    }]
                }

                response = requests.post(
                    f"{self.base_url}/broadcast",
                    json=payload,
                    headers={"x-api-key": self.api_secret, "Content-Type": "application/json"},
                    timeout=15,
                )

                if response.status_code == 200:
                    data = response.json()
                    log("info",
                        f"Pick broadcast via API: {data.get('sent', 0)}/{data.get('picks', 0)} users — {pick['market_id'][:50]}",
                        source="api_broadcaster")
                    sent += 1
                else:
                    log("warning",
                        f"Broadcast failed ({response.status_code}): {response.text[:200]}",
                        source="api_broadcaster")

            except Exception as e:
                log("warning", f"Broadcast error: {e}", source="api_broadcaster")

        log("info", f"Broadcast {sent}/{len(picks)} picks to bot API", source="api_broadcaster")
        return sent

    @staticmethod
    def _score_to_confidence(score: int) -> str:
        if score >= 90:
            return "Very High"
        elif score >= 80:
            return "High"
        elif score >= 70:
            return "Medium"
        return "Low"
