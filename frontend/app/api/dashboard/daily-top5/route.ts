import { NextResponse } from "next/server";
import { getSupabase } from "@/app/lib/supabase-server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * GET /api/dashboard/daily-top5
 *
 * EasyPoly's daily recommended traders to copy.
 * Blends composite score, ROI, win rate, and recent momentum
 * with tier diversity to surface the best traders to follow today.
 */
export async function GET() {
  try {
    const sb = getSupabase();

    // Fetch all active traders with meaningful data
    const { data: traders, error } = await sb
      .from("ep_tracked_traders")
      .select("*")
      .eq("active", true)
      .gt("composite_rank", 0)
      .gte("trade_count", 10)
      .order("composite_rank", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Daily top 5 query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = traders || [];

    // ── Bot Detection (same heuristics as Rising Stars) ──
    const now = new Date();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    const filtered = rows.filter((t: any) => {
      const alias = (t.alias || "").toLowerCase();
      if (/^0x[a-f0-9]{8,}$/.test(alias) && (t.trade_count || 0) > 50) return false;
      if (alias.includes("updown") || alias.includes("up-down")) return false;
      if ((t.win_rate || 0) >= 99 && (t.trade_count || 0) > 15) return false;
      if ((t.roi || 0) <= 0) return false;
      if ((t.markets_traded || 0) < 2) return false;

      // ── Inactivity filter: must have traded in last 30 days ──
      if (!t.last_trade_date) return false;
      const lastTrade = new Date(t.last_trade_date);
      if (now.getTime() - lastTrade.getTime() > THIRTY_DAYS_MS) return false;

      return true;
    });

    // ── Scoring: "Best to copy today" ──
    const scored = filtered.map((t: any) => {
      const compositeNorm = Math.min((t.composite_rank || 0) * 100, 100); // 0-100
      const roiScore = Math.min(Math.max((t.roi || 0) / 5, 0), 100); // Cap at 500% ROI = 100
      const winRateScore = Math.max((t.win_rate || 0) - 40, 0) * (100 / 60); // 40-100% → 0-100
      const momentumScore = (t.pnl_7d || 0) > 0 ? Math.min((t.pnl_7d || 0) / 1000, 100) : 0;
      const consistencyNorm = Math.min((t.consistency_score || 0), 100);

      const pickScore =
        compositeNorm * 0.35 +
        roiScore * 0.25 +
        winRateScore * 0.20 +
        momentumScore * 0.10 +
        consistencyNorm * 0.10;

      // Generate pick reason
      let pickReason = "";
      if (compositeNorm >= 70) {
        pickReason = `Top composite score (${(t.composite_rank * 100).toFixed(0)}/100)`;
      } else if ((t.win_rate || 0) >= 70) {
        pickReason = `${t.win_rate.toFixed(0)}% win rate across ${t.trade_count} trades`;
      } else if ((t.pnl_7d || 0) > 0) {
        pickReason = `Strong recent momentum`;
      } else {
        pickReason = `Consistent performer with ${(t.roi || 0).toFixed(0)}% ROI`;
      }

      return { ...t, pick_score: Math.round(pickScore * 100) / 100, pick_reason: pickReason };
    });

    // Sort by pick score
    scored.sort((a: any, b: any) => b.pick_score - a.pick_score);

    // ── Tier Diversity: ensure mix of tiers ──
    const top5: any[] = [];
    const tierCounts: Record<string, number> = {};
    const bigTiers = new Set(["whale", "mid"]);
    const smallTiers = new Set(["small", "micro"]);
    let hasBig = false;
    let hasSmall = false;

    for (const t of scored) {
      if (top5.length >= 5) break;
      const tier = t.bankroll_tier || "unknown";
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;

      // Allow max 2 from same tier
      if (tierCounts[tier] > 2) continue;

      // If we have 4 and no small tier yet, force one
      if (top5.length === 4 && !hasSmall && smallTiers.has(tier)) {
        top5.push(t);
        hasSmall = true;
        continue;
      }
      if (top5.length === 4 && !hasBig && bigTiers.has(tier)) {
        top5.push(t);
        hasBig = true;
        continue;
      }

      top5.push(t);
      if (bigTiers.has(tier)) hasBig = true;
      if (smallTiers.has(tier)) hasSmall = true;
    }

    // If diversity wasn't met, backfill from remaining scored
    if (top5.length < 5) {
      for (const t of scored) {
        if (top5.length >= 5) break;
        if (!top5.find((x: any) => x.id === t.id)) {
          top5.push(t);
        }
      }
    }

    return NextResponse.json(
      {
        top5,
        updated_at: new Date().toISOString(),
        total_scored: scored.length,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    console.error("Daily top 5 API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
