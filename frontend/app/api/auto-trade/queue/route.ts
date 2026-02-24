import { NextResponse } from 'next/server';
import { getSupabase } from '@/app/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auto-trade/queue?wallet=0x...
 *
 * Returns pending auto-trade signals for the user — signals from
 * followed traders (with auto_trade=true) that haven't been executed
 * or dismissed yet. Respects daily trade limits.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet')?.toLowerCase();

    if (!wallet) {
      return NextResponse.json(
        { error: 'Missing wallet query parameter' },
        { status: 400 }
      );
    }

    const sb = getSupabase();

    // ── 1. Get user's auto-trade follows ────────────
    const { data: follows, error: followsErr } = await sb
      .from('ep_user_follows')
      .select('trader_id, amount_per_trade, max_daily_trades')
      .eq('user_wallet', wallet)
      .eq('active', true)
      .eq('auto_trade', true);

    if (followsErr) throw followsErr;
    if (!follows || follows.length === 0) {
      return NextResponse.json({ pendingTrades: [], stats: { dailyUsed: 0, dailyLimit: 0 } });
    }

    const traderIds = follows.map((f: any) => f.trader_id);
    const followMap = Object.fromEntries(
      follows.map((f: any) => [f.trader_id, f])
    );

    // ── 2. Get today's auto-trade executions ────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayLogs } = await sb
      .from('ep_auto_trade_log')
      .select('signal_id, trader_id')
      .eq('user_wallet', wallet)
      .gte('created_at', todayStart.toISOString());

    const executedSignalIds = new Set((todayLogs || []).map((l: any) => l.signal_id));
    const dailyUsed = (todayLogs || []).length;

    // Count per-trader daily usage
    const traderDailyCount: Record<string, number> = {};
    for (const log of todayLogs || []) {
      traderDailyCount[log.trader_id] = (traderDailyCount[log.trader_id] || 0) + 1;
    }

    // ── 3. Get dismissed signals ────────────────────
    const { data: dismissed } = await sb
      .from('ep_auto_trade_dismissed')
      .select('signal_id')
      .eq('user_wallet', wallet);

    const dismissedIds = new Set((dismissed || []).map((d: any) => d.signal_id));

    // ── 4. Get recent signals from followed traders ─
    // Look back 24 hours for signals
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: signals, error: signalsErr } = await sb
      .from('ep_trader_trades')
      .select('*, ep_tracked_traders(alias, wallet_address, roi, win_rate, bankroll_tier, trading_style)')
      .in('trader_id', traderIds)
      .gte('timestamp', cutoff)
      .order('timestamp', { ascending: false })
      .limit(50);

    if (signalsErr) throw signalsErr;

    // ── 5. Filter out executed + dismissed signals ──
    const pendingRaw = (signals || []).filter((s: any) => {
      if (executedSignalIds.has(s.id)) return false;
      if (dismissedIds.has(s.id)) return false;

      // Check per-trader daily limit
      const follow = followMap[s.trader_id];
      if (!follow) return false;
      const used = traderDailyCount[s.trader_id] || 0;
      if (used >= follow.max_daily_trades) return false;

      return true;
    });

    // ── 6. Enrich with market data ──────────────────
    const marketIds = Array.from(new Set(pendingRaw.map((s: any) => s.market_id)));
    let marketsMap: Record<string, any> = {};
    if (marketIds.length > 0) {
      const { data: markets } = await sb
        .from('ep_markets_raw')
        .select('market_id, question, category, yes_price, no_price, yes_token, no_token')
        .in('market_id', marketIds);

      for (const m of markets || []) {
        marketsMap[m.market_id] = m;
      }
    }

    // ── 7. Format response ──────────────────────────
    const totalDailyLimit = follows.reduce(
      (sum: number, f: any) => sum + (f.max_daily_trades || 5),
      0
    );

    const pendingTrades = pendingRaw.map((s: any) => {
      const { ep_tracked_traders, ...rest } = s;
      const market = marketsMap[s.market_id];
      const follow = followMap[s.trader_id];

      return {
        signalId: s.id,
        traderId: s.trader_id,
        traderAlias: ep_tracked_traders?.alias || 'Unknown',
        traderRoi: ep_tracked_traders?.roi || 0,
        traderWinRate: ep_tracked_traders?.win_rate || 0,
        traderTier: ep_tracked_traders?.bankroll_tier || '',
        traderStyle: ep_tracked_traders?.trading_style || '',
        marketId: s.market_id,
        marketQuestion: market?.question || s.market_id,
        marketCategory: market?.category || '',
        direction: s.direction || 'YES',
        traderAmount: s.amount || 0,
        traderPrice: s.price || 0,
        currentYesPrice: market?.yes_price || 0,
        currentNoPrice: market?.no_price || 0,
        yesToken: market?.yes_token || '',
        noToken: market?.no_token || '',
        suggestedAmount: follow?.amount_per_trade || 10,
        timestamp: s.timestamp || s.created_at,
      };
    });

    return NextResponse.json({
      pendingTrades,
      stats: {
        dailyUsed,
        dailyLimit: totalDailyLimit,
      },
    });
  } catch (err: any) {
    console.error('Auto-trade queue error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch auto-trade queue' },
      { status: 500 }
    );
  }
}
