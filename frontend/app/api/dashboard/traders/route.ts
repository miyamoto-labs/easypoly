import { NextResponse } from "next/server";
import { getSupabase } from "@/app/lib/supabase-server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * GET /api/dashboard/traders
 * Query params:
 *   tier   — bankroll tier filter: micro | small | mid | whale | all (default: all)
 *   style  — trading style filter: degen | sniper | grinder | whale | all (default: all)
 *   sort   — sort field: roi | win_rate | total_pnl | composite_rank (default: roi)
 *   source — source filter: user_added | scanner | all (default: all)
 *   limit  — max results (default: 150, max: 200)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "150"), 200);
    const tier = searchParams.get("tier") || "all";
    const style = searchParams.get("style") || "all";
    const sort = searchParams.get("sort") || "composite_rank";
    const source = searchParams.get("source") || "all";
    const category = searchParams.get("category") || "all";

    const sb = getSupabase();

    // Build query with filters
    let query = sb
      .from("ep_tracked_traders")
      .select("*")
      .eq("active", true);

    // Filter by source
    if (source === "user_added") {
      query = query.eq("source", "user_added");
    } else if (source === "scanner") {
      query = query.or("source.is.null,source.neq.user_added");
    }

    // Filter by bankroll tier
    if (tier && tier !== "all") {
      query = query.eq("bankroll_tier", tier);
    }

    // Filter by trading style
    if (style && style !== "all") {
      query = query.eq("trading_style", style);
    }

    // Filter by category
    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    // Sort
    const sortMap: Record<string, string> = {
      roi: "roi",
      win_rate: "win_rate",
      total_pnl: "total_pnl",
      composite_rank: "composite_rank",
    };
    const sortCol = sortMap[sort] || "roi";
    query = query.order(sortCol, { ascending: false }).limit(limit);

    const { data: traders, error: tradersErr } = await query;

    if (tradersErr) {
      console.error("Traders query error:", tradersErr);
      return NextResponse.json({ error: tradersErr.message }, { status: 500 });
    }

    // Get recent trades for these traders (last 100 trades)
    const { data: trades } = await sb
      .from("ep_trader_trades")
      .select("*, ep_markets_raw(question, yes_price, no_price)")
      .order("created_at", { ascending: false })
      .limit(100);

    // Group trades by trader_id and rename ep_markets_raw → market
    const tradesByTrader: Record<string, any[]> = {};
    for (const trade of trades || []) {
      const { ep_markets_raw, ...rest } = trade;
      const cleanTrade = { ...rest, market: ep_markets_raw || null };
      if (!tradesByTrader[cleanTrade.trader_id]) {
        tradesByTrader[cleanTrade.trader_id] = [];
      }
      tradesByTrader[cleanTrade.trader_id].push(cleanTrade);
    }

    // Enrich traders with their trades
    const enriched = (traders || []).map((t: any) => ({
      ...t,
      recent_trades: (tradesByTrader[t.id] || []).slice(0, 5),
    }));

    // Summary stats (for the filtered set)
    const tradersList = traders || [];
    const totalPnl = tradersList.reduce((s: number, t: any) => s + (t.total_pnl || 0), 0);
    const avgRoi = tradersList.length > 0
      ? tradersList.reduce((s: number, t: any) => s + (t.roi || 0), 0) / tradersList.length
      : 0;
    const avgWinRate = tradersList.length > 0
      ? tradersList.reduce((s: number, t: any) => s + (t.win_rate || 0), 0) / tradersList.length
      : 0;

    // Top performer (highest ROI in filtered set)
    const topPerformer = tradersList.length > 0
      ? tradersList.reduce((best: any, t: any) => (t.roi || 0) > (best.roi || 0) ? t : best, tradersList[0])
      : null;

    // Tier breakdown
    const tierBreakdown: Record<string, number> = {};
    for (const t of tradersList) {
      const bt = t.bankroll_tier || "unknown";
      tierBreakdown[bt] = (tierBreakdown[bt] || 0) + 1;
    }

    // Style breakdown
    const styleBreakdown: Record<string, number> = {};
    for (const t of tradersList) {
      const ts = t.trading_style || "unknown";
      styleBreakdown[ts] = (styleBreakdown[ts] || 0) + 1;
    }

    return NextResponse.json(
      {
        traders: enriched,
        total_traders: tradersList.length,
        total_tracked_pnl: Math.round(totalPnl),
        avg_roi: Math.round(avgRoi * 10) / 10,
        avg_win_rate: Math.round(avgWinRate * 10) / 10,
        top_performer: topPerformer ? {
          alias: topPerformer.alias,
          roi: topPerformer.roi,
          tier: topPerformer.bankroll_tier,
        } : null,
        tier_breakdown: tierBreakdown,
        style_breakdown: styleBreakdown,
        total_signals: trades?.length || 0,
        filters: { tier, style, sort },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    console.error("Traders API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
