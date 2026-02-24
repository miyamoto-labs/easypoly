import { NextResponse } from "next/server";
import { getSupabase } from "@/app/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = getSupabase();

    // 1. Get tracked traders sorted by composite rank
    const { data: traders, error: tradersErr } = await sb
      .from("ep_tracked_traders")
      .select("*")
      .eq("active", true)
      .order("composite_rank", { ascending: false })
      .limit(20);

    if (tradersErr) throw tradersErr;

    // 2. Get recent copy signals (trader trades) with full trader info
    const { data: trades, error: tradesErr } = await sb
      .from("ep_trader_trades")
      .select("*, ep_tracked_traders(alias, wallet_address, composite_rank, total_pnl, roi, win_rate, bankroll_tier, trading_style)")
      .order("timestamp", { ascending: false })
      .limit(30);

    if (tradesErr) throw tradesErr;

    // 3. Enrich trades with market question from ep_markets_raw
    const marketIds = Array.from(new Set((trades || []).map((t: any) => t.market_id)));
    let marketsMap: Record<string, any> = {};
    if (marketIds.length > 0) {
      const { data: markets } = await sb
        .from("ep_markets_raw")
        .select("market_id, question, category, yes_price, no_price, yes_token, no_token")
        .in("market_id", marketIds);

      for (const m of markets || []) {
        marketsMap[m.market_id] = m;
      }
    }

    // 4. Format trades: rename ep_tracked_traders → trader, add market
    const enrichedTrades = (trades || []).map((t: any) => {
      const { ep_tracked_traders, ...rest } = t;
      return {
        ...rest,
        trader: ep_tracked_traders || null,
        market: marketsMap[t.market_id] || null,
      };
    });

    // 5. Summary stats
    const totalTraders = (traders || []).length;
    const totalSignals = (trades || []).length;
    const avgRank =
      totalTraders > 0
        ? (traders || []).reduce((sum: number, t: any) => sum + (t.composite_rank || 0), 0) / totalTraders
        : 0;
    const totalTrackedPnl = (traders || []).reduce(
      (sum: number, t: any) => sum + (t.total_pnl || 0),
      0
    );

    return NextResponse.json(
      {
        traders: traders || [],
        signals: enrichedTrades,
        stats: {
          total_traders: totalTraders,
          total_signals: totalSignals,
          avg_rank: Math.round(avgRank * 1000) / 1000,
          total_tracked_pnl: Math.round(totalTrackedPnl),
        },
      },
      {
        headers: {
          "Cache-Control": "s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (err: any) {
    console.error("Shadow API error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch shadow data" },
      { status: 500 }
    );
  }
}
