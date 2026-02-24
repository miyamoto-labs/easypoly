import { NextResponse } from "next/server";
import { getSupabase } from "@/app/lib/supabase-server";

export const dynamic = "force-dynamic";

const GAMMA_URL = "https://gamma-api.polymarket.com";
const MAX_CONCURRENT = 10;

interface GammaMarketData {
  yesPrice: number;
  noPrice: number;
  yesToken: string;
  noToken: string;
  question?: string;
}

/**
 * Fetch live market data from Gamma API by slug or condition_id.
 */
async function fetchGammaMarket(id: string): Promise<GammaMarketData | null> {
  try {
    const isHex = id.startsWith("0x");
    const param = isHex ? `condition_id=${id}` : `slug=${id}`;
    const res = await fetch(`${GAMMA_URL}/markets?${param}&limit=1`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const market = data[0];
    if (!market) return null;

    const rawPrices = market.outcomePrices || "[]";
    const prices: string[] =
      typeof rawPrices === "string" ? JSON.parse(rawPrices) : rawPrices;

    const rawTokens = market.clobTokenIds || "[]";
    const tokens: string[] =
      typeof rawTokens === "string" ? JSON.parse(rawTokens) : rawTokens;

    return {
      yesPrice: prices[0] ? parseFloat(prices[0]) : 0,
      noPrice: prices[1] ? parseFloat(prices[1]) : 0,
      yesToken: tokens[0] || "",
      noToken: tokens[1] || "",
      question: market.question || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Batch-fetch Gamma market data for multiple slugs/condition_ids.
 */
async function batchFetchGamma(
  ids: string[]
): Promise<Record<string, GammaMarketData>> {
  const results: Record<string, GammaMarketData> = {};
  const unique = [...new Set(ids.filter(Boolean))];

  for (let i = 0; i < unique.length; i += MAX_CONCURRENT) {
    const batch = unique.slice(i, i + MAX_CONCURRENT);
    const settled = await Promise.allSettled(
      batch.map((id) => fetchGammaMarket(id))
    );
    settled.forEach((result, idx) => {
      if (result.status === "fulfilled" && result.value) {
        results[batch[idx]] = result.value;
      }
    });
  }

  return results;
}

/**
 * GET /api/dashboard/portfolio?wallet=0x...
 * Aggregates positions from Polymarket Data API + trade history from Supabase.
 * Enriches with live prices from Gamma API.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get("wallet")?.toLowerCase();

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Missing wallet query parameter" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // ── 1. Fetch live positions from Polymarket Data API ──────
    let positions: any[] = [];
    let positionsError = false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const posRes = await fetch(
        `https://data-api.polymarket.com/positions?user=${walletAddress}&sizeThreshold=0`,
        { cache: "no-store", signal: controller.signal }
      );
      clearTimeout(timeout);
      if (posRes.ok) {
        const raw = await posRes.json();
        positions = Array.isArray(raw) ? raw : [];
      } else {
        positionsError = true;
        console.error("Polymarket positions API returned:", posRes.status);
      }
    } catch (err) {
      positionsError = true;
      console.error("Polymarket positions API error:", err);
    }

    // ── 2. Fetch trade history from ep_user_trades ────────────
    const { data: trades, error: tradesErr } = await supabase
      .from("ep_user_trades")
      .select("*")
      .eq("user_wallet", walletAddress)
      .order("created_at", { ascending: false })
      .limit(50);

    if (tradesErr) {
      console.error("Trades query error:", tradesErr);
    }

    const tradeRows = trades || [];

    // ── 2b. Enrich trades with market questions ─────────────
    let enrichedTrades = tradeRows;
    try {
      const tokenIds = [...new Set(tradeRows.map((t) => t.token_id).filter(Boolean))];
      if (tokenIds.length > 0) {
        const [{ data: yesMatches }, { data: noMatches }] = await Promise.all([
          supabase
            .from("ep_markets_raw")
            .select("question, category, yes_token, no_token")
            .in("yes_token", tokenIds),
          supabase
            .from("ep_markets_raw")
            .select("question, category, yes_token, no_token")
            .in("no_token", tokenIds),
        ]);

        const tokenMap = new Map<string, { question: string; category: string }>();
        for (const m of [...(yesMatches || []), ...(noMatches || [])]) {
          if (m.yes_token) tokenMap.set(m.yes_token, { question: m.question, category: m.category });
          if (m.no_token) tokenMap.set(m.no_token, { question: m.question, category: m.category });
        }

        enrichedTrades = tradeRows.map((t) => ({
          ...t,
          market_question: tokenMap.get(t.token_id)?.question || null,
          market_category: tokenMap.get(t.token_id)?.category || null,
        }));

        // Fallback: for trades still missing questions, also check ep_curated_picks
        const missingTokenIds = enrichedTrades
          .filter((t) => !t.market_question && t.token_id)
          .map((t) => t.token_id);

        if (missingTokenIds.length > 0) {
          const { data: pickMatches } = await supabase
            .from("ep_curated_picks")
            .select("question, token_id, category")
            .in("token_id", [...new Set(missingTokenIds)])
            .not("question", "is", null);

          if (pickMatches && pickMatches.length > 0) {
            const pickMap = new Map<string, { question: string; category: string | null }>();
            for (const p of pickMatches) {
              if (p.token_id) pickMap.set(p.token_id, { question: p.question, category: p.category });
            }
            enrichedTrades = enrichedTrades.map((t) => {
              if (!t.market_question && t.token_id && pickMap.has(t.token_id)) {
                return {
                  ...t,
                  market_question: pickMap.get(t.token_id)!.question,
                  market_category: pickMap.get(t.token_id)!.category,
                };
              }
              return t;
            });
          }
        }
      }
    } catch {
      // Non-critical — trades will just lack market names
    }

    // ── 3. Build initial position objects ────────────────────
    const initialPositions = positions
      .filter((p) => parseFloat(p.size || "0") > 0)
      .map((p) => {
        const currentValue = parseFloat(p.currentValue || "0");
        const initialValue = parseFloat(p.initialValue || "0");
        const pnl = currentValue - initialValue;
        const pnlPercent =
          initialValue > 0 ? (pnl / initialValue) * 100 : 0;

        const title =
          p.asset?.market_slug ||
          p.asset?.condition_id ||
          p.slug ||
          p.conditionId ||
          "Unknown Market";

        const question =
          p.title ||
          p.asset?.question ||
          p.proxyTitle ||
          formatSlug(title);

        const outcome = p.outcome || p.asset?.outcome || "";
        const slug = p.asset?.market_slug || p.slug || "";
        const conditionId = p.conditionId || p.asset?.condition_id || "";

        // Asset ID extraction with multiple fallbacks
        const assetId =
          (typeof p.asset === "string" ? p.asset : p.asset?.token_id) ||
          p.asset_id ||
          p.tokenId ||
          "";

        return {
          id: conditionId || Math.random().toString(36),
          question,
          outcome,
          size: parseFloat(p.size || "0"),
          avgPrice: parseFloat(p.avgPrice || "0"),
          curPrice: parseFloat(p.curPrice || "0"),
          currentValue: Math.round(currentValue * 100) / 100,
          initialValue: Math.round(initialValue * 100) / 100,
          pnl: Math.round(pnl * 100) / 100,
          pnlPercent: Math.round(pnlPercent * 10) / 10,
          slug,
          assetId,
          conditionId,
          // Flag to indicate if assetId came from Data API or needs Gamma resolution
          _needsGamma: !assetId || parseFloat(p.curPrice || "0") === 0,
        };
      });

    // ── 4. Batch-fetch live data from Gamma API ─────────────
    // Collect slugs/conditionIds for Gamma lookups
    const gammaLookupIds: string[] = [];
    const posToGammaKey = new Map<number, string>();

    initialPositions.forEach((pos, idx) => {
      // Prefer slug for Gamma lookups (condition_id can match wrong markets)
      const lookupId = pos.slug || pos.conditionId;
      if (lookupId) {
        gammaLookupIds.push(lookupId);
        posToGammaKey.set(idx, lookupId);
      }
    });

    let gammaData: Record<string, GammaMarketData> = {};
    if (gammaLookupIds.length > 0) {
      try {
        gammaData = await batchFetchGamma(gammaLookupIds);
      } catch (err) {
        console.warn("Gamma batch fetch failed:", err);
      }
    }

    // ── 5. Enrich positions with Gamma data ─────────────────
    const enriched = initialPositions.map((pos, idx) => {
      const gammaKey = posToGammaKey.get(idx);
      const gamma = gammaKey ? gammaData[gammaKey] : null;

      let { curPrice, assetId } = pos;
      let livePrice: number | null = null;

      if (gamma) {
        // Determine which side this position is on
        const isYes = pos.outcome?.toUpperCase() === "YES";

        // Live price from Gamma
        livePrice = isYes ? gamma.yesPrice : gamma.noPrice;

        // If curPrice is 0/missing, use Gamma price
        if (!curPrice || curPrice === 0) {
          curPrice = livePrice || 0;
        }

        // If assetId is missing, resolve from Gamma CLOB token IDs
        if (!assetId) {
          assetId = isYes ? gamma.yesToken : gamma.noToken;
          if (assetId) {
            console.log(
              `[Portfolio] Resolved assetId from Gamma for "${pos.question?.slice(0, 40)}": ${assetId.slice(0, 20)}...`
            );
          }
        }

        // If question was "Unknown Market", try Gamma's question
        if (pos.question === "Unknown Market" && gamma.question) {
          pos.question = gamma.question;
        }
      }

      // Recalculate P&L with corrected price
      const currentValue = pos.size * curPrice;
      const pnl = currentValue - pos.initialValue;
      const pnlPercent =
        pos.initialValue > 0 ? (pnl / pos.initialValue) * 100 : 0;

      // Determine sell availability
      let sellDisabled = false;
      let sellDisabledReason = "";
      if (!assetId) {
        sellDisabled = true;
        sellDisabledReason = "Token ID could not be resolved for this market";
      }

      // Remove internal flag
      const { _needsGamma, ...rest } = pos;

      return {
        ...rest,
        curPrice,
        livePrice,
        assetId,
        currentValue: Math.round(currentValue * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        pnlPercent: Math.round(pnlPercent * 10) / 10,
        sellDisabled,
        sellDisabledReason,
      };
    }).sort((a, b) => Math.abs(b.currentValue) - Math.abs(a.currentValue));

    // ── 6. Compute aggregate stats ────────────────────────────
    const totalValue = enriched.reduce((s, p) => s + p.currentValue, 0);
    const unrealizedPnl = enriched.reduce((s, p) => s + p.pnl, 0);
    const winning = enriched.filter((p) => p.pnl > 0);
    const winRate =
      enriched.length > 0
        ? (winning.length / enriched.length) * 100
        : 0;

    return NextResponse.json({
      positions: enriched,
      trades: enrichedTrades,
      positionsError,
      stats: {
        totalValue: Math.round(totalValue * 100) / 100,
        unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
        winRate: Math.round(winRate * 10) / 10,
        totalTrades: enrichedTrades.length,
        activePositions: enriched.length,
      },
    });
  } catch (err: any) {
    console.error("Portfolio API error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch portfolio" },
      { status: 500 }
    );
  }
}

/** Convert "will-trump-win-2024" → "Will Trump Win 2024" */
function formatSlug(slug: string): string {
  return slug
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
