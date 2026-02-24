"""
Conviction Engine — Scores market opportunities using Claude AI.
Uses Claude Sonnet 4 to analyze each opportunity and produce conviction scores.
Integrates Perplexity for real-time news context.
"""
from __future__ import annotations

import json
import anthropic
from datetime import datetime, timezone

from config import ANTHROPIC_API_KEY, PERPLEXITY_API_KEY, CONVICTION_CONFIG, PERPLEXITY_CONFIG
from db.queries import OpportunityQueries, PickQueries, MarketQueries, AuditLog
from utils.logger import log
from utils.rate_limiter import rate_limiter

# ── Category normalizer ──────────────────────────────────────
# Maps Gamma API categories to landing-site tab categories
_CATEGORY_MAP = {
    "crypto": "crypto", "nfts": "crypto", "defi": "crypto",
    "bitcoin": "crypto", "ethereum": "crypto",
    "politics": "politics", "global politics": "politics",
    "us politics": "politics", "elections": "politics",
    "sports": "sports", "nba": "sports", "nba playoffs": "sports",
    "nfl": "sports", "mlb": "sports", "soccer": "sports",
    "mls": "sports", "nhl": "sports", "tennis": "sports",
    "chess": "sports", "esports": "sports", "olympics": "sports",
    "formula 1": "sports", "boxing": "sports", "mma": "sports",
    "golf": "sports", "cricket": "sports",
    "culture": "culture", "entertainment": "culture", "art": "culture",
    "music": "culture", "movies": "culture", "tv": "culture",
    "social media": "culture", "celebrity": "culture",
    "finance": "finance", "business": "finance", "economics": "finance",
    "stocks": "finance", "fed": "finance", "markets": "finance",
    "coronavirus": "culture",  # legacy Polymarket category
    "coronavirus-": "culture",
}


def normalize_category(raw: str | None) -> str:
    """Normalize Gamma API category to landing-site category."""
    if not raw:
        return "culture"  # default fallback
    key = raw.strip().lower()
    return _CATEGORY_MAP.get(key, "culture")


class ConvictionEngine:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        self.model = CONVICTION_CONFIG["model"]
        self.min_score = CONVICTION_CONFIG["min_conviction_score"]
        self.min_rr = CONVICTION_CONFIG["min_risk_reward"]

    def score_opportunities(self) -> list[dict]:
        """Score unprocessed opportunities and create picks for high-conviction ones."""
        opps = OpportunityQueries.get_unprocessed(limit=20)
        if not opps:
            return []

        log("info", f"Scoring {len(opps)} opportunities with Claude", source="conviction_engine")

        # Skip markets that already have ANY pick in the last 24h (not just active)
        # This prevents re-picking the same market every 30-min cycle after
        # the resolver closes the previous pick.
        recent_market_ids = PickQueries.get_recent_market_ids(hours=24)
        log("info", f"Skipping {len(recent_market_ids)} markets with recent picks (24h window)", source="conviction_engine")

        picks = []
        for opp in opps:
            if opp["market_id"] in recent_market_ids:
                OpportunityQueries.mark_processed(opp["id"])
                continue

            # Skip boring extreme-odds markets (99¢ NO / 1¢ YES)
            market = MarketQueries.get_market_by_id(opp["market_id"])
            if market:
                yes_price = market.get("yes_price", 0.5)
                if yes_price > 0.92 or yes_price < 0.08:
                    OpportunityQueries.mark_processed(opp["id"])
                    continue

            try:
                result = self._analyze_opportunity(opp)
                OpportunityQueries.mark_processed(opp["id"])

                if result and result.get("conviction_score", 0) >= self.min_score:
                    if result.get("risk_reward", 0) >= self.min_rr:
                        pick = self._create_pick(opp, result)
                        if pick:
                            picks.append(pick)
                            recent_market_ids.add(opp["market_id"])
                            log("info",
                                f"NEW PICK: {opp['market_id'][:50]} — {result['direction']} @ {result['entry_price']*100:.1f}¢ — score={result['conviction_score']}",
                                source="conviction_engine")
            except Exception as e:
                log("warning", f"Error scoring {opp['market_id'][:30]}: {e}", source="conviction_engine")
                OpportunityQueries.mark_processed(opp["id"])

        log("info", f"Produced {len(picks)} curated picks from {len(opps)} opportunities", source="conviction_engine")
        AuditLog.log("conviction", {"input": len(opps), "output": len(picks)}, source="conviction_engine")
        return picks

    def _analyze_opportunity(self, opp: dict) -> dict | None:
        """Use Claude to analyze a single opportunity."""
        market = MarketQueries.get_market_by_id(opp["market_id"])
        if not market:
            return None

        # Get Perplexity news context if available
        news_context = self._get_news_context(market["question"]) if PERPLEXITY_API_KEY else ""

        signal = opp.get("signal_data", {})
        if isinstance(signal, str):
            try:
                signal = json.loads(signal)
            except Exception:
                signal = {}

        prompt = f"""You are a professional prediction market analyst. Analyze this Polymarket opportunity and provide a trading recommendation.

MARKET:
- Question: {market['question']}
- Category: {market.get('category', 'unknown')}
- Current YES price: {market.get('yes_price', 0.5)}
- Current NO price: {market.get('no_price', 0.5)}
- Volume: ${market.get('volume', 0):,.0f}
- Liquidity: ${market.get('liquidity', 0):,.0f}
- End date: {market.get('end_date', 'unknown')}

SIGNAL DETECTED:
- Type: {opp.get('signal_type', 'unknown')}
- Strength: {opp.get('strength', 0)}
- Data: {json.dumps(signal)[:500]}

{f'RECENT NEWS CONTEXT:{chr(10)}{news_context}' if news_context else ''}

Respond with ONLY valid JSON (no markdown, no explanation):
{{
    "direction": "YES" or "NO",
    "conviction_score": 0-100,
    "entry_price": 0.01-0.99,
    "target_price": 0.01-0.99,
    "stop_loss": 0.01-0.99,
    "risk_reward": float,
    "time_horizon": "hours" or "days" or "weeks",
    "edge_explanation": "string explaining the edge",
    "telegram_summary": "1-2 sentence summary for Telegram",
    "confidence_factors": ["factor1", "factor2"],
    "risk_factors": ["risk1"],
    "position_size_suggestion": "small" or "medium" or "large"
}}"""

        try:
            rate_limiter.wait("anthropic")
            response = self.client.messages.create(
                model=self.model,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()
            # Clean up potential markdown wrapper
            if text.startswith("```"):
                text = text.split("\n", 1)[1] if "\n" in text else text[3:]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()
            return json.loads(text)
        except Exception as e:
            log("warning", f"Claude analysis failed: {e}", source="conviction_engine")
            return None

    def _get_news_context(self, question: str) -> str:
        """Get real-time news context from Perplexity."""
        if not PERPLEXITY_API_KEY:
            return ""
        try:
            import requests
            rate_limiter.wait("perplexity")
            response = requests.post(
                "https://api.perplexity.ai/chat/completions",
                headers={
                    "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": PERPLEXITY_CONFIG["model"],
                    "messages": [
                        {"role": "system", "content": "Provide brief, factual news context relevant to this prediction market question. Focus on recent developments that could affect the outcome. Be concise (max 200 words)."},
                        {"role": "user", "content": f"What are the latest developments relevant to: {question}"}
                    ],
                    "max_tokens": PERPLEXITY_CONFIG["max_tokens"],
                },
                timeout=15,
            )
            if response.status_code == 200:
                data = response.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            log("warning", f"Perplexity failed: {e}", source="conviction_engine")
        return ""

    def _create_pick(self, opp: dict, analysis: dict) -> dict | None:
        """Create a curated pick from analysis results.

        Enriches with market data so the landing site can display the pick
        correctly (question, category, slug, token_id, composite_score, tier).
        """
        # Fetch market data for enrichment
        market = MarketQueries.get_market_by_id(opp["market_id"])

        # Determine token_id based on direction
        token_id = None
        if market:
            if analysis["direction"] == "YES":
                token_id = market.get("yes_token")
            else:
                token_id = market.get("no_token")

        # ── Composite Score (6-factor weighted blend) ─────────
        conv = analysis["conviction_score"]
        rr = analysis.get("risk_reward", 0)
        vol = market.get("volume", 0) if market else 0
        strength = opp.get("strength", 0.5)
        if isinstance(strength, str):
            try:
                strength = float(strength)
            except ValueError:
                strength = 0.5

        edge_score = min(conv, 100)
        rr_score = min(rr * 20, 100)                          # 5:1 R/R → 100
        momentum_score = min(strength * 100, 100)
        liquidity_score = min((vol / 50_000) * 100, 100)      # $50k vol → 100
        inefficiency_score = 50.0                               # default baseline
        recency_score = 90.0                                    # fresh pick

        composite = round(
            edge_score * 0.25
            + rr_score * 0.20
            + momentum_score * 0.15
            + liquidity_score * 0.15
            + inefficiency_score * 0.15
            + recency_score * 0.10,
            1,
        )
        composite = min(composite, 100)

        # ── Tier assignment ───────────────────────────────────
        if composite >= 85:
            tier = "S"
        elif composite >= 70:
            tier = "A"
        elif composite >= 55:
            tier = "B"
        elif composite >= 40:
            tier = "C"
        else:
            tier = "D"

        # ── Confidence label ──────────────────────────────────
        if conv >= 80:
            confidence = "HIGH"
        elif conv >= 65:
            confidence = "MEDIUM"
        else:
            confidence = "LOW"

        pick_data = {
            # ── Core fields (existing) ────────────────────────
            "market_id": opp["market_id"],
            "direction": analysis["direction"],
            "conviction_score": analysis["conviction_score"],
            "entry_price": analysis["entry_price"],
            "target_price": analysis["target_price"],
            "stop_loss": analysis["stop_loss"],
            "risk_reward": analysis.get("risk_reward", 0),
            "edge_explanation": analysis.get("edge_explanation", ""),
            "telegram_summary": analysis.get("telegram_summary", ""),
            "time_horizon": analysis.get("time_horizon", "days"),
            "confidence_factors": analysis.get("confidence_factors", []),
            "risk_factors": analysis.get("risk_factors", []),
            "position_size_suggestion": analysis.get("position_size_suggestion", "small"),
            "status": "active",
            # ── Landing-site compatibility fields (NEW) ───────
            "question": market.get("question") if market else None,
            "category": normalize_category(market.get("category")) if market else None,
            "slug": opp["market_id"],
            "token_id": token_id,
            "composite_score": composite,
            "tier": tier,
            "volume_24h": vol,
            "liquidity": market.get("liquidity", 0) if market else 0,
            "edge_score": round(edge_score, 1),
            "rr_score": round(rr_score, 1),
            "momentum_score": round(momentum_score, 1),
            "side": analysis["direction"],
            "price": analysis["entry_price"],
            "confidence": confidence,
            "reasoning": analysis.get("edge_explanation", ""),
            "expires_at": market.get("end_date") if market else None,
        }
        try:
            result = PickQueries.insert_pick(pick_data)
            return result
        except Exception as e:
            log("warning", f"Failed to save pick: {e}", source="conviction_engine")
            return None
