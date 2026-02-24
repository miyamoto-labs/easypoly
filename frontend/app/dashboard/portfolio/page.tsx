"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import StatsGrid from "../components/StatsGrid";
import { WalletConnectButton } from "@/app/components/ui";
import { useUserStore } from "@/app/lib/stores/user-store";
import { timeAgo } from "@/app/lib/utils/timeAgo";
import Link from "next/link";
import { useUsdcBalance } from "@/app/lib/hooks/useUsdcBalance";
import { SellPositionModal, type SellPosition } from "@/app/components/ui/SellPositionModal";
import { WithdrawModal } from "@/app/components/ui/WithdrawModal";
import {
  PortfolioComposition,
  TradeTimeline,
  PnLDistribution,
} from "@/app/components/ui/charts";

// Dynamic import for lightweight-charts (no SSR)
const CumulativePnL = dynamic(
  () => import("@/app/components/ui/charts/CumulativePnL").then((m) => m.CumulativePnL),
  { ssr: false }
);

interface Position {
  id: string;
  question: string;
  outcome: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  livePrice: number | null;
  currentValue: number;
  initialValue: number;
  pnl: number;
  pnlPercent: number;
  slug: string;
  assetId: string;
  conditionId: string;
  sellDisabled?: boolean;
  sellDisabledReason?: string;
}

interface Trade {
  id: string;
  side: string;
  direction: string;
  amount: number;
  price: number;
  shares: number;
  order_id: string;
  created_at: string;
  source: string | null;
  token_id?: string;
  market_question?: string | null;
  market_category?: string | null;
  realized_pnl?: number | null;
  resolved_at?: string | null;
}

interface PortfolioStats {
  totalValue: number;
  unrealizedPnl: number;
  winRate: number;
  totalTrades: number;
  activePositions: number;
}

interface CopyTrader {
  trader_id: string;
  auto_trade: boolean;
  amount_per_trade: number;
  max_daily_trades: number;
  trader: {
    alias: string;
    roi: number;
    win_rate: number;
    bankroll_tier: string;
  } | null;
}

export default function PortfolioPage() {
  const { walletAddress, isConnected, follows } = useUserStore();
  const { balance: usdcBalance, formatted: balanceFormatted, loading: balanceLoading, refetch: refetchBalance } = useUsdcBalance();
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [positionsError, setPositionsError] = useState(false);
  const [sellTarget, setSellTarget] = useState<SellPosition | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [copyTraders, setCopyTraders] = useState<CopyTrader[]>([]);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [livePrices, setLivePrices] = useState<
    Record<string, { yes: number; no: number; yesToken: string; noToken: string }>
  >({});

  // Fetch live prices from Gamma API for position slugs
  const fetchLivePrices = useCallback(async (positionList: Position[]) => {
    const slugs = positionList
      .map((p) => p.slug || p.conditionId)
      .filter(Boolean);
    const unique = [...new Set(slugs)];
    if (unique.length === 0) return;

    try {
      const res = await fetch(`/api/dashboard/picks/prices?ids=${unique.join(",")}`);
      if (res.ok) {
        const data = await res.json();
        setLivePrices(data.prices || {});
      }
    } catch {
      // Non-critical — positions still show API prices
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch(`/api/dashboard/portfolio?wallet=${walletAddress}`);
      if (res.ok) {
        const data = await res.json();
        const newPositions = data.positions || [];
        setPositions(newPositions);
        setTrades(data.trades || []);
        setStats(data.stats || null);
        setPositionsError(!!data.positionsError);
        // Also fetch live prices for these positions
        fetchLivePrices(newPositions);
      }
    } catch (err) {
      console.error("Portfolio fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, fetchLivePrices]);

  const fetchCopyTraders = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch(`/api/follows/list?walletAddress=${walletAddress}`);
      if (res.ok) {
        const data = await res.json();
        setCopyTraders(data.follows || []);
      }
    } catch {
      // Non-critical
    }
  }, [walletAddress]);

  // Lazy-resolve unresolved trades in the background, then refresh
  const resolveTradesOnce = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch("/api/trades/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.resolved > 0) {
          // Re-fetch to pick up newly resolved P&L
          fetchData();
        }
      }
    } catch {
      // Non-critical
    }
  }, [walletAddress, fetchData]);

  // Keep a ref to positions for the price polling interval (avoids re-render loop)
  const positionsRef = useRef<Position[]>([]);
  useEffect(() => { positionsRef.current = positions; }, [positions]);

  useEffect(() => {
    if (!isConnected || !walletAddress) {
      setLoading(false);
      return;
    }
    fetchData();
    fetchCopyTraders();
    resolveTradesOnce(); // fire-and-forget background resolution
    // Full data refresh every 30s, live prices every 15s
    const dataInterval = setInterval(fetchData, 30000);
    const priceInterval = setInterval(() => {
      if (positionsRef.current.length > 0) fetchLivePrices(positionsRef.current);
    }, 15000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(priceInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, fetchCopyTraders, fetchLivePrices, resolveTradesOnce, isConnected, walletAddress]);

  // Merge live prices into positions
  const enrichedPositions = useMemo(() => {
    if (Object.keys(livePrices).length === 0) return positions;
    return positions.map((pos) => {
      const key = pos.slug || pos.conditionId;
      const lp = key ? livePrices[key] : null;
      if (!lp) return pos;

      const isYes = pos.outcome?.toUpperCase() === "YES";
      const livePrice = isYes ? lp.yes : lp.no;

      // Resolve assetId from Gamma if missing
      let assetId = pos.assetId;
      if (!assetId) {
        assetId = isYes ? lp.yesToken : lp.noToken;
      }

      // Recalculate with live price
      const curPrice = livePrice || pos.curPrice;
      const currentValue = pos.size * curPrice;
      const pnl = currentValue - pos.initialValue;
      const pnlPercent = pos.initialValue > 0 ? (pnl / pos.initialValue) * 100 : 0;

      return {
        ...pos,
        curPrice,
        livePrice,
        assetId,
        currentValue: Math.round(currentValue * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        pnlPercent: Math.round(pnlPercent * 10) / 10,
        sellDisabled: !assetId,
        sellDisabledReason: !assetId ? "Token ID could not be resolved" : undefined,
      };
    });
  }, [positions, livePrices]);

  // ── Wallet Gate ──────────────────────────────────
  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="ep-card p-8 sm:p-12 text-center max-w-md space-y-4">
          <div className="text-4xl">💼</div>
          <h2 className="font-display text-xl font-bold">Connect Your Wallet</h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            Log in to view your positions, trade history,
            and P&L in real time.
          </p>
          <WalletConnectButton variant="inline" />
        </div>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-text-muted">
        <svg className="mr-2 h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading portfolio...
      </div>
    );
  }

  // Compute realized P&L from resolved trades
  const totalRealizedPnl = trades
    .filter((t) => t.realized_pnl != null)
    .reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
  const resolvedTradeCount = trades.filter((t) => t.realized_pnl != null).length;
  const wonTradeCount = trades.filter((t) => t.realized_pnl != null && t.realized_pnl > 0).length;

  const statsCards = [
    {
      label: "USDC Balance",
      value: balanceLoading ? "..." : (balanceFormatted ?? "$0.00"),
      icon: "pnl",
      sub: usdcBalance !== null && usdcBalance < 1 ? "Fund wallet to trade" : "Available to trade or withdraw",
      trend: usdcBalance !== null && usdcBalance < 1 ? ("down" as const) : ("neutral" as const),
    },
    {
      label: "Portfolio Value",
      value: `$${(stats?.totalValue || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      icon: "markets",
      sub: `${stats?.activePositions || 0} active positions`,
    },
    {
      label: "Unrealized P&L",
      value: `${(stats?.unrealizedPnl || 0) >= 0 ? "+" : ""}$${(stats?.unrealizedPnl || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      icon: "winrate",
      sub: "Across open positions",
      trend: (stats?.unrealizedPnl || 0) > 0 ? ("up" as const) : (stats?.unrealizedPnl || 0) < 0 ? ("down" as const) : ("neutral" as const),
    },
    {
      label: "Realized P&L",
      value: `${totalRealizedPnl >= 0 ? "+" : ""}$${totalRealizedPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      icon: "picks",
      sub: resolvedTradeCount > 0 ? `${wonTradeCount}/${resolvedTradeCount} trades won` : "No resolved trades yet",
      trend: totalRealizedPnl > 0 ? ("up" as const) : totalRealizedPnl < 0 ? ("down" as const) : ("neutral" as const),
    },
  ];

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────── */}
      <div className="flex items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold">Portfolio</h1>
          <p className="text-xs sm:text-sm text-text-muted mt-1">
            Your positions, trade history, and P&L
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Withdraw button */}
          {usdcBalance !== null && usdcBalance > 0 && (
            <button
              onClick={() => setWithdrawOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-accent/30 text-accent
                bg-accent/[0.06] hover:bg-accent/15 transition flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Withdraw
            </button>
          )}
          <div className="hidden sm:flex items-center gap-2 text-xs text-text-muted">
            <span className="live-dot" />
            Auto-refreshing
          </div>
        </div>
      </div>

      {/* ── Stats ───────────────────────────────── */}
      <StatsGrid stats={statsCards} />

      {/* ── Fund Wallet Banner (when balance is zero) ── */}
      {usdcBalance !== null && usdcBalance < 1 && walletAddress && (
        <div className="ep-card p-4 border border-accent/20 bg-accent/[0.04]">
          <div className="flex items-start gap-3">
            <div className="text-xl shrink-0">💰</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">Fund Your Wallet</p>
              <p className="text-xs text-text-muted mt-0.5 mb-2">
                Send USDC on Polygon to your trading wallet to start placing bets:
              </p>
              <div className="flex items-center gap-2">
                <code className="text-[11px] font-mono bg-ep-surface px-2 py-1 rounded border border-ep-border text-text-secondary break-all">
                  {walletAddress}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(walletAddress)}
                  className="shrink-0 text-[10px] px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition font-medium"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Currently Copytrading ────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Currently Copytrading</h2>
            {copyTraders.length > 0 && (
              <p className="text-xs text-text-muted mt-0.5">
                ${copyTraders.reduce((s, t) => s + (t.amount_per_trade || 0), 0)} total capital per round
              </p>
            )}
          </div>
          {copyTraders.length > 0 && (
            <Link
              href="/dashboard/shadow"
              className="text-xs text-accent hover:text-accent/80 transition font-medium"
            >
              View Signals →
            </Link>
          )}
        </div>

        {copyTraders.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {copyTraders.map((ct) => (
              <motion.div
                key={ct.trader_id}
                className="ep-card p-4 flex items-center gap-3"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{
                    background: (ct.trader?.roi || 0) > 0 ? 'rgba(0,240,160,0.15)' : 'rgba(139,146,168,0.15)',
                    color: (ct.trader?.roi || 0) > 0 ? '#00F0A0' : '#8B92A8',
                    border: `2px solid ${(ct.trader?.roi || 0) > 0 ? 'rgba(0,240,160,0.3)' : 'rgba(139,146,168,0.3)'}`,
                  }}
                >
                  {(ct.trader?.alias || '?')[0]?.toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-text-primary truncate">
                      {ct.trader?.alias || 'Unknown'}
                    </span>
                    {ct.auto_trade && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-bold">AUTO</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-muted">
                    <span className="font-mono font-semibold text-accent">${ct.amount_per_trade}/trade</span>
                    <span>·</span>
                    <span>{ct.max_daily_trades}/day max</span>
                  </div>
                </div>

                {/* ROI */}
                {ct.trader?.roi != null && (
                  <div className="text-right shrink-0">
                    <div className={`font-mono text-sm font-bold ${
                      ct.trader.roi > 0 ? 'text-profit' : ct.trader.roi < 0 ? 'text-loss' : 'text-text-muted'
                    }`}>
                      {ct.trader.roi > 0 ? '+' : ''}{ct.trader.roi.toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-text-muted">ROI</div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="ep-card p-6 text-center">
            <div className="text-2xl mb-2">👥</div>
            <p className="text-sm font-medium text-text-primary">Not copying anyone yet</p>
            <p className="text-xs text-text-muted mt-1 mb-3">
              Follow top traders and auto-copy their moves.
            </p>
            <Link
              href="/dashboard/traders"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-accent/10 text-accent hover:bg-accent/20 transition"
            >
              Browse Traders →
            </Link>
          </div>
        )}
      </div>

      {/* ── Analytics Charts ──────────────────────── */}
      {(enrichedPositions.length > 0 || trades.length > 0) && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold">Analytics</h2>

          {/* Row 1: Composition + Cumulative P&L */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {enrichedPositions.length > 0 && (
              <motion.div
                className="ep-card p-4 sm:p-6"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
                  Position Allocation
                </h3>
                <PortfolioComposition
                  positions={enrichedPositions}
                  totalValue={stats?.totalValue || 0}
                />
              </motion.div>
            )}

            {trades.length > 0 && (
              <motion.div
                className="ep-card p-4 sm:p-6"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
                  Cumulative P&L
                </h3>
                <CumulativePnL trades={trades} />
              </motion.div>
            )}
          </div>

          {/* Row 2: Trade Timeline + P&L Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {trades.length > 0 && (
              <motion.div
                className="ep-card p-4 sm:p-6"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
                  Trade Activity
                </h3>
                <TradeTimeline trades={trades} />
              </motion.div>
            )}

            {enrichedPositions.length > 0 && (
              <motion.div
                className="ep-card p-4 sm:p-6"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
                  P&L by Position
                </h3>
                <PnLDistribution positions={enrichedPositions} />
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* ── Positions API Warning ─────────────────── */}
      {positionsError && (
        <div className="ep-card p-4 border border-yellow-500/20 bg-yellow-500/[0.04] flex items-start gap-3">
          <svg className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-yellow-400">Could not load live positions</p>
            <p className="text-xs text-text-muted mt-0.5">
              Polymarket&apos;s API is temporarily unavailable. Your trade history below is still accurate. Positions will load automatically when the API recovers.
            </p>
          </div>
        </div>
      )}

      {/* ── Active Positions ────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold">Active Positions</h2>
        <p className="mt-1 text-xs text-gray-500">
          Live positions on your connected Polymarket wallet
        </p>

        {enrichedPositions.length > 0 ? (
          <div className="mt-4 space-y-3">
            {enrichedPositions.map((pos, i) => (
              <motion.div
                key={pos.id}
                className="ep-card p-4"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Market question */}
                    <p className="text-sm font-medium text-text-primary leading-snug truncate sm:whitespace-normal">
                      {pos.question}
                    </p>

                    {/* Outcome + entry info */}
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                      {pos.outcome && (
                        <span className={`rounded px-2 py-0.5 font-bold ${
                          pos.outcome.toUpperCase() === "YES"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        }`}>
                          {pos.outcome.toUpperCase()}
                        </span>
                      )}
                      <span className="text-text-muted">
                        Entry{" "}
                        <span className="font-mono text-text-secondary">
                          {(pos.avgPrice * 100).toFixed(1)}¢
                        </span>
                      </span>
                      <span className="text-text-muted flex items-center gap-1">
                        Current{" "}
                        <span className="font-mono text-text-secondary">
                          {(pos.curPrice * 100).toFixed(1)}¢
                        </span>
                        {pos.livePrice != null && (
                          <span className="h-1.5 w-1.5 rounded-full bg-profit animate-pulse" title="Live price" />
                        )}
                      </span>
                      <span className="text-text-muted">
                        Shares{" "}
                        <span className="font-mono text-text-secondary">
                          {pos.size.toFixed(1)}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* P&L + Close button */}
                  <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                    <div>
                      <div className={`font-mono text-sm font-bold ${
                        pos.pnl >= 0 ? "text-profit" : "text-loss"
                      }`}>
                        {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)}
                      </div>
                      <div className={`font-mono text-[11px] ${
                        pos.pnlPercent >= 0 ? "text-profit/70" : "text-loss/70"
                      }`}>
                        {pos.pnlPercent >= 0 ? "+" : ""}{pos.pnlPercent.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        ${pos.currentValue.toFixed(2)}
                      </div>
                    </div>
                    {/* Close/Sell button */}
                    {pos.sellDisabled ? (
                      <span
                        className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-ep-border text-text-muted cursor-not-allowed"
                        title={pos.sellDisabledReason || "Cannot close this position"}
                      >
                        Close
                      </span>
                    ) : (
                      <button
                        onClick={() => setSellTarget(pos)}
                        className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-loss/30 text-loss hover:bg-loss/10 transition"
                      >
                        Close
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="mt-4 ep-card p-8 text-center">
            <div className="text-2xl mb-2">📭</div>
            <p className="text-text-secondary text-sm">No open positions</p>
            <p className="text-text-muted text-xs mt-1">
              Positions will appear here when you trade on Polymarket
            </p>
          </div>
        )}
      </div>

      {/* ── Trade History ───────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold">Trade History</h2>
        <p className="mt-1 text-xs text-gray-500">
          Orders placed through EasyPoly
        </p>

        {trades.length > 0 ? (
          <div className="mt-4 space-y-2">
            {trades.map((trade) => {
              // Match trade with active position by token_id for P&L
              const matchedPosition = trade.token_id
                ? enrichedPositions.find((p) => p.assetId === trade.token_id)
                : null;
              const isActive = !!matchedPosition;
              const tradeKey = trade.id || trade.order_id;
              const isExpanded = expandedTradeId === tradeKey;

              return (
                <div
                  key={tradeKey}
                  className="ep-card overflow-hidden hover:bg-white/[0.02] transition cursor-pointer"
                  onClick={() => setExpandedTradeId(isExpanded ? null : tradeKey)}
                >
                  {/* Main row */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary leading-snug truncate sm:whitespace-normal">
                          {trade.market_question || "Unknown Market"}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                          {/* Side + Direction badge */}
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            trade.direction === "YES"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          }`}>
                            {trade.side} {trade.direction || "—"}
                          </span>
                          {/* Amount */}
                          <span className="font-mono text-text-primary font-semibold">
                            ${Number(trade.amount).toFixed(2)}
                          </span>
                          {/* Entry price */}
                          <span className="text-text-muted">
                            @ {(Number(trade.price) * 100).toFixed(1)}¢
                          </span>
                          {/* Status badge */}
                          {isActive ? (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-accent/15 text-accent">
                              ACTIVE
                            </span>
                          ) : trade.realized_pnl != null ? (
                            trade.realized_pnl > 0 ? (
                              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                                WON ✓
                              </span>
                            ) : (
                              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-500/20 text-red-400">
                                LOST ✗
                              </span>
                            )
                          ) : trade.resolved_at ? (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-ep-surface text-text-muted">
                              RESOLVED
                            </span>
                          ) : (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-yellow-500/15 text-yellow-400">
                              OPEN
                            </span>
                          )}
                          {/* Time */}
                          <span className="text-text-muted">
                            {timeAgo(trade.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* P&L + expand chevron */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          {matchedPosition ? (
                            <>
                              <div className={`font-mono text-sm font-bold ${
                                matchedPosition.pnl >= 0 ? "text-profit" : "text-loss"
                              }`}>
                                {matchedPosition.pnl >= 0 ? "+" : ""}${matchedPosition.pnl.toFixed(2)}
                              </div>
                              <div className={`font-mono text-[11px] ${
                                matchedPosition.pnlPercent >= 0 ? "text-profit/70" : "text-loss/70"
                              }`}>
                                {matchedPosition.pnlPercent >= 0 ? "+" : ""}{matchedPosition.pnlPercent.toFixed(1)}%
                              </div>
                              <div className="text-[9px] text-text-muted mt-0.5">Unrealized</div>
                            </>
                          ) : trade.realized_pnl != null ? (
                            <>
                              <div className={`font-mono text-sm font-bold ${
                                trade.realized_pnl >= 0 ? "text-profit" : "text-loss"
                              }`}>
                                {trade.realized_pnl >= 0 ? "+" : ""}${trade.realized_pnl.toFixed(2)}
                              </div>
                              <div className="text-[9px] text-text-muted mt-0.5">Realized</div>
                            </>
                          ) : (
                            <span className="text-[11px] text-yellow-400/70">Open Order</span>
                          )}
                        </div>
                        <svg
                          className={`w-4 h-4 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-0 border-t border-ep-border/50">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3">
                            {/* Trade Date */}
                            <div>
                              <p className="text-[10px] text-text-muted uppercase tracking-wider">Placed</p>
                              <p className="text-xs text-text-secondary mt-0.5 font-mono">
                                {new Date(trade.created_at).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                                {" "}
                                {new Date(trade.created_at).toLocaleTimeString("en-US", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>

                            {/* Entry Price */}
                            <div>
                              <p className="text-[10px] text-text-muted uppercase tracking-wider">Entry Price</p>
                              <p className="text-xs text-text-secondary mt-0.5 font-mono">
                                {(Number(trade.price) * 100).toFixed(1)}¢
                              </p>
                            </div>

                            {/* Shares */}
                            <div>
                              <p className="text-[10px] text-text-muted uppercase tracking-wider">Shares</p>
                              <p className="text-xs text-text-secondary mt-0.5 font-mono">
                                {Number(trade.shares).toFixed(2)}
                              </p>
                            </div>

                            {/* Current Price (if active) */}
                            {matchedPosition && (
                              <div>
                                <p className="text-[10px] text-text-muted uppercase tracking-wider">Current Price</p>
                                <p className="text-xs text-text-secondary mt-0.5 font-mono">
                                  {(matchedPosition.curPrice * 100).toFixed(1)}¢
                                </p>
                              </div>
                            )}

                            {/* Current Value (if active) */}
                            {matchedPosition && (
                              <div>
                                <p className="text-[10px] text-text-muted uppercase tracking-wider">Current Value</p>
                                <p className="text-xs text-text-secondary mt-0.5 font-mono">
                                  ${matchedPosition.currentValue.toFixed(2)}
                                </p>
                              </div>
                            )}

                            {/* Source */}
                            <div>
                              <p className="text-[10px] text-text-muted uppercase tracking-wider">Source</p>
                              <p className="text-xs text-text-secondary mt-0.5">
                                {trade.source === "pick"
                                  ? "AI Pick"
                                  : trade.source === "signal"
                                  ? "Copy Signal"
                                  : trade.source === "arcade"
                                  ? "Arcade"
                                  : trade.source === "polytinder"
                                  ? "PolyTinder"
                                  : trade.source === "standing-order"
                                  ? "Standing Order"
                                  : trade.source || "Manual"}
                              </p>
                            </div>

                            {/* Amount */}
                            <div>
                              <p className="text-[10px] text-text-muted uppercase tracking-wider">Amount</p>
                              <p className="text-xs text-text-secondary mt-0.5 font-mono">
                                ${Number(trade.amount).toFixed(2)}
                              </p>
                            </div>

                            {/* Direction */}
                            <div>
                              <p className="text-[10px] text-text-muted uppercase tracking-wider">Direction</p>
                              <p className="text-xs mt-0.5">
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  trade.direction === "YES"
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-red-500/20 text-red-400"
                                }`}>
                                  {trade.direction || "—"}
                                </span>
                              </p>
                            </div>

                            {/* Status */}
                            <div>
                              <p className="text-[10px] text-text-muted uppercase tracking-wider">Status</p>
                              <p className="text-xs mt-0.5">
                                {isActive ? (
                                  <span className="text-accent font-semibold">Open — holding</span>
                                ) : trade.realized_pnl != null ? (
                                  trade.realized_pnl > 0 ? (
                                    <span className="text-emerald-400 font-semibold">Won ✓</span>
                                  ) : (
                                    <span className="text-red-400 font-semibold">Lost ✗</span>
                                  )
                                ) : trade.resolved_at ? (
                                  <span className="text-text-muted">Resolved</span>
                                ) : (
                                  <span className="text-text-muted">Pending resolution</span>
                                )}
                              </p>
                            </div>

                            {/* Resolved Date (if resolved) */}
                            {trade.resolved_at && (
                              <div>
                                <p className="text-[10px] text-text-muted uppercase tracking-wider">Resolved</p>
                                <p className="text-xs text-text-secondary mt-0.5 font-mono">
                                  {new Date(trade.resolved_at).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* P&L summary bar for active positions */}
                          {matchedPosition && (
                            <div className={`mt-3 p-3 rounded-lg ${
                              matchedPosition.pnl >= 0 ? "bg-profit/[0.06] border border-profit/20" : "bg-loss/[0.06] border border-loss/20"
                            }`}>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-text-secondary">Unrealized P&L</span>
                                <div className="flex items-center gap-2">
                                  <span className={`font-mono text-sm font-bold ${
                                    matchedPosition.pnl >= 0 ? "text-profit" : "text-loss"
                                  }`}>
                                    {matchedPosition.pnl >= 0 ? "+" : ""}${matchedPosition.pnl.toFixed(2)}
                                  </span>
                                  <span className={`font-mono text-xs ${
                                    matchedPosition.pnlPercent >= 0 ? "text-profit/70" : "text-loss/70"
                                  }`}>
                                    ({matchedPosition.pnlPercent >= 0 ? "+" : ""}{matchedPosition.pnlPercent.toFixed(1)}%)
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* P&L summary bar for resolved trades */}
                          {!matchedPosition && trade.realized_pnl != null && (
                            <div className={`mt-3 p-3 rounded-lg ${
                              trade.realized_pnl >= 0 ? "bg-profit/[0.06] border border-profit/20" : "bg-loss/[0.06] border border-loss/20"
                            }`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`text-base ${trade.realized_pnl > 0 ? "" : ""}`}>
                                    {trade.realized_pnl > 0 ? "🎉" : "📉"}
                                  </span>
                                  <span className="text-xs text-text-secondary">Realized P&L</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`font-mono text-sm font-bold ${
                                    trade.realized_pnl >= 0 ? "text-profit" : "text-loss"
                                  }`}>
                                    {trade.realized_pnl >= 0 ? "+" : ""}${trade.realized_pnl.toFixed(2)}
                                  </span>
                                  {Number(trade.amount) > 0 && (
                                    <span className={`font-mono text-xs ${
                                      trade.realized_pnl >= 0 ? "text-profit/70" : "text-loss/70"
                                    }`}>
                                      ({trade.realized_pnl >= 0 ? "+" : ""}{((trade.realized_pnl / Number(trade.amount)) * 100).toFixed(1)}%)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 ep-card p-8 text-center">
            <div className="text-2xl mb-2">📋</div>
            <p className="text-text-secondary text-sm">No trades yet</p>
            <p className="text-text-muted text-xs mt-1">
              Your EasyPoly trade history will appear here
            </p>
          </div>
        )}
      </div>

      {/* ── Sell Position Modal ───────────────────── */}
      <SellPositionModal
        position={sellTarget}
        onClose={() => setSellTarget(null)}
        onSuccess={() => {
          fetchData();
          refetchBalance();
        }}
      />

      {/* ── Withdraw Modal ─────────────────────────── */}
      <WithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        onSuccess={() => {
          refetchBalance();
          fetchData();
        }}
      />
    </div>
  );
}
