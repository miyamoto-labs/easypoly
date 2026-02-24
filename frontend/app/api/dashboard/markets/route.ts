import { NextResponse } from "next/server";
import { getSupabase } from "@/app/lib/supabase-server";

export const revalidate = 60;

export async function GET() {
  try {
    const sb = getSupabase();

    const { data: markets, error } = await sb
      .from("ep_markets_raw")
      .select("market_id, question, category, volume, liquidity, yes_price, no_price, active, end_date")
      .eq("active", true)
      .order("volume", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = markets || [];

    // Aggregate stats
    const totalVolume = rows.reduce((s, m) => s + (m.volume || 0), 0);
    const totalLiquidity = rows.reduce((s, m) => s + (m.liquidity || 0), 0);

    // Category breakdown
    const categories: Record<string, number> = {};
    rows.forEach((m) => {
      const cat = m.category || "other";
      categories[cat] = (categories[cat] || 0) + 1;
    });

    return NextResponse.json(
      {
        total_markets: rows.length,
        total_volume: Math.round(totalVolume),
        total_liquidity: Math.round(totalLiquidity),
        categories,
        top_markets: rows.slice(0, 10).map((m) => ({
          market_id: m.market_id,
          question: m.question,
          yes_price: m.yes_price,
          no_price: m.no_price,
          volume: m.volume,
          liquidity: m.liquidity,
          category: m.category,
          end_date: m.end_date,
        })),
        // Hot markets: top 20 by volume for the ticker
        hot_markets: rows.slice(0, 20).map((m) => ({
          market_id: m.market_id,
          question: m.question,
          yes_price: m.yes_price,
          volume: m.volume,
          category: m.category,
        })),
      },
      {
        headers: {
          "Cache-Control": "s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (err: any) {
    console.error("Markets API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
