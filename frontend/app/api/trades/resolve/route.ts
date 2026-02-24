import { NextResponse } from "next/server";
import { getSupabase } from "@/app/lib/supabase-server";

export const dynamic = "force-dynamic";

const GAMMA_URL = "https://gamma-api.polymarket.com";

/**
 * POST /api/trades/resolve
 * Resolves unresolved BUY trades for a user by checking Polymarket market outcomes.
 * Called lazily when user views their portfolio.
 *
 * Body: { walletAddress: string }
 *
 * For each unresolved BUY trade:
 * 1. Look up market slug via ep_markets_raw (token_id → slug)
 * 2. Check Gamma API if market is resolved
 * 3. If resolved, calculate realized P&L and update the trade
 */
export async function POST(request: Request) {
  try {
    const { walletAddress } = await request.json();

    if (!walletAddress) {
      return NextResponse.json({ error: "Missing walletAddress" }, { status: 400 });
    }

    const address = walletAddress.toLowerCase();
    const supabase = getSupabase();

    // ── 1. Fetch unresolved BUY trades ──
    const { data: unresolvedTrades, error: fetchErr } = await supabase
      .from("ep_user_trades")
      .select("id, token_id, direction, amount, price, shares, created_at")
      .eq("user_wallet", address)
      .eq("side", "BUY")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(20); // cap to avoid long-running requests

    if (fetchErr || !unresolvedTrades || unresolvedTrades.length === 0) {
      return NextResponse.json({ resolved: 0 });
    }

    // ── 2. Look up market info for each token_id ──
    const tokenIds = [...new Set(unresolvedTrades.map((t) => t.token_id).filter(Boolean))];
    if (tokenIds.length === 0) {
      return NextResponse.json({ resolved: 0 });
    }

    // Find markets matching these tokens
    const [{ data: yesMatches }, { data: noMatches }] = await Promise.all([
      supabase
        .from("ep_markets_raw")
        .select("slug, condition_id, yes_token, no_token, end_date")
        .in("yes_token", tokenIds),
      supabase
        .from("ep_markets_raw")
        .select("slug, condition_id, yes_token, no_token, end_date")
        .in("no_token", tokenIds),
    ]);

    // Build token → market lookup
    const tokenMarketMap = new Map<
      string,
      { slug: string; conditionId: string; yesToken: string; noToken: string; endDate: string }
    >();
    for (const m of [...(yesMatches || []), ...(noMatches || [])]) {
      const entry = {
        slug: m.slug,
        conditionId: m.condition_id,
        yesToken: m.yes_token,
        noToken: m.no_token,
        endDate: m.end_date,
      };
      if (m.yes_token) tokenMarketMap.set(m.yes_token, entry);
      if (m.no_token) tokenMarketMap.set(m.no_token, entry);
    }

    // ── 3. Group trades by market slug ──
    const slugToTrades = new Map<string, typeof unresolvedTrades>();
    const noSlugTrades: typeof unresolvedTrades = [];

    for (const trade of unresolvedTrades) {
      const market = tokenMarketMap.get(trade.token_id);
      if (!market?.slug) {
        noSlugTrades.push(trade);
        continue;
      }
      const existing = slugToTrades.get(market.slug) || [];
      existing.push(trade);
      slugToTrades.set(market.slug, existing);
    }

    // ── 4. Check each market's resolution status via Gamma API ──
    let resolvedCount = 0;
    const now = new Date().toISOString();

    // Process max 10 slugs per call to keep response time reasonable
    const slugsToCheck = [...slugToTrades.keys()].slice(0, 10);

    for (const slug of slugsToCheck) {
      try {
        const res = await fetch(`${GAMMA_URL}/markets/slug/${slug}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) continue;

        const market = await res.json();
        if (!market.resolved) continue;

        // Parse outcome
        const outcomePrices =
          typeof market.outcomePrices === "string"
            ? JSON.parse(market.outcomePrices)
            : market.outcomePrices || [];

        const yesWon = parseFloat(outcomePrices[0] || "0") > 0.5;

        // Resolve each trade for this market
        const tradesToResolve = slugToTrades.get(slug) || [];
        for (const trade of tradesToResolve) {
          const marketInfo = tokenMarketMap.get(trade.token_id);
          if (!marketInfo) continue;

          // Determine if user's token is the YES or NO side
          const isYesToken = trade.token_id === marketInfo.yesToken;
          const userWon = (isYesToken && yesWon) || (!isYesToken && !yesWon);

          // P&L: If won, shares pay out $1 each. If lost, shares worth $0.
          const pnl = userWon
            ? Number(trade.shares) * 1 - Number(trade.amount)
            : -Number(trade.amount);

          // Update trade in DB
          await supabase
            .from("ep_user_trades")
            .update({
              realized_pnl: Math.round(pnl * 100) / 100,
              resolved_at: now,
              market_slug: slug,
            })
            .eq("id", trade.id);

          resolvedCount++;
        }
      } catch {
        // Skip this market — will retry next time
        continue;
      }
    }

    // ── 5. Handle old trades without market data (older than 7 days) ──
    // Mark very old unresolved trades as "unknown" so they don't get retried forever
    for (const trade of noSlugTrades) {
      const ageMs = Date.now() - new Date(trade.created_at).getTime();
      if (ageMs > 7 * 24 * 60 * 60 * 1000) {
        await supabase
          .from("ep_user_trades")
          .update({ resolved_at: now })
          .eq("id", trade.id);
      }
    }

    return NextResponse.json({ resolved: resolvedCount });
  } catch (err: any) {
    console.error("Trade resolve error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to resolve trades" },
      { status: 500 }
    );
  }
}
