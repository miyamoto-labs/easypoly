"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TraderCard,
  TraderCardSkeleton,
  FilterBar,
  SortDropdown,
  StatCard,
  StatCardSkeleton,
  DailyTop5,
} from "@/app/components/ui";
import { useUserStore } from "@/app/lib/stores/user-store";
import { useWalletConnect } from "@/app/lib/hooks/useWalletConnect";

/* ── Constants ──────────────────────────────────── */
const tierOptions = [
  { value: "all", label: "All Tiers" },
  { value: "custom", label: "My Tracked" },
  { value: "micro", label: "Micro" },
  { value: "small", label: "Small" },
  { value: "mid", label: "Mid" },
  { value: "whale", label: "Whale" },
];

const styleOptions = [
  { value: "all", label: "All Styles" },
  { value: "degen", label: "Degens" },
  { value: "sniper", label: "Snipers" },
  { value: "grinder", label: "Grinders" },
  { value: "whale", label: "Whales" },
];

const categoryOptions = [
  { value: "all", label: "All Categories" },
  { value: "politics", label: "Politics" },
  { value: "culture", label: "Culture" },
  { value: "finance", label: "Finance" },
  { value: "mentions", label: "Mentions" },
  { value: "crypto", label: "Crypto" },
  { value: "sports", label: "Sports" },
];

const sortOptions = [
  { value: "roi", label: "Best ROI" },
  { value: "win_rate", label: "Highest Win Rate" },
  { value: "total_pnl", label: "Most Profitable" },
  { value: "composite_rank", label: "Best Rank" },
];

/* ── Page ───────────────────────────────────────── */
export default function TradersPage() {
  const [traders, setTraders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState("all");
  const [style, setStyle] = useState("all");
  const [sort, setSort] = useState("composite_rank");
  const [category, setCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  /* ── Wallet & follows ── */
  const walletAddress = useUserStore((s) => s.walletAddress);
  const isConnected = useUserStore((s) => s.isConnected);
  const fetchFollows = useUserStore((s) => s.fetchFollows);
  const { connect } = useWalletConnect();
  const [connectError, setConnectError] = useState<string | null>(null);

  // Fetch follows when wallet is connected
  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchFollows();
    }
  }, [isConnected, walletAddress, fetchFollows]);

  // Handler when Follow is clicked but wallet not connected
  const handleFollowRequiresWallet = useCallback(async () => {
    setConnectError(null);
    try {
      await connect();
    } catch (err: any) {
      setConnectError(err.message || "Failed to connect wallet");
    }
  }, [connect]);

  /* ── Custom address tracking ── */
  const [customAddr, setCustomAddr] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [customLoading, setCustomLoading] = useState(false);
  const [customResult, setCustomResult] = useState<{
    type: "success" | "error";
    message: string;
    trader?: any;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleTrackWallet = async () => {
    const addr = customAddr.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setCustomResult({ type: "error", message: "Invalid address — must be 0x + 40 hex characters" });
      return;
    }
    setCustomLoading(true);
    setCustomResult(null);
    try {
      const res = await fetch("/api/traders/add-custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: addr, addedBy: walletAddress, category: customCategory || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add trader");
      setCustomResult({
        type: "success",
        message: data.isNew
          ? `Added ${data.trader.alias || addr.slice(0, 10)} — now you can copy-trade!`
          : `${data.trader.alias || addr.slice(0, 10)} is already tracked.`,
        trader: data.trader,
      });
      setCustomAddr("");
      // Refresh list to include the new trader
      fetchData();
    } catch (err: any) {
      setCustomResult({ type: "error", message: err.message || "Something went wrong" });
    } finally {
      setCustomLoading(false);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ style, sort, limit: "150" });
      // "custom" maps to source=user_added, others map to tier
      if (tier === "custom") {
        params.set("tier", "all");
        params.set("source", "user_added");
      } else {
        params.set("tier", tier);
      }
      if (category !== "all") {
        params.set("category", category);
      }
      const res = await fetch(`/api/dashboard/traders?${params}`);
      const data = await res.json();

      setTraders(data.traders || []);
      setStats({
        totalTraders: data.total_traders || 0,
        avgRoi: data.avg_roi || 0,
        avgWinRate: data.avg_win_rate || 0,
        totalPnl: data.total_tracked_pnl || 0,
        topPerformer: data.top_performer || null,
        tierBreakdown: data.tier_breakdown || {},
        styleBreakdown: data.style_breakdown || {},
      });
    } catch (err) {
      console.error("Traders fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [tier, style, sort, category]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="py-6 space-y-6">
      {/* ── Header ─────────────────────────────── */}
      <div className="flex items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold">Traders</h1>
          <p className="text-xs sm:text-sm text-text-muted mt-1">
            {stats?.totalTraders || 0} classified traders across 4 bankroll tiers
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Grid / Table toggle */}
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded-lg transition ${viewMode === "grid" ? "bg-accent/10 text-accent" : "text-text-muted hover:text-text-primary"}`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`p-2 rounded-lg transition ${viewMode === "table" ? "bg-accent/10 text-accent" : "text-text-muted hover:text-text-primary"}`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Track Any Wallet ────────────────────── */}
      <div className="ep-card p-4 sm:p-5 border border-ep-border/60">
        <div className="flex items-start sm:items-center gap-3 mb-3">
          <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <div>
            <h2 className="font-display font-semibold text-sm text-text-primary">Track Any Wallet</h2>
            <p className="text-[11px] text-text-muted leading-snug">
              Found a trader on Twitter? Paste their Polymarket address and start copy-trading in seconds.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={customAddr}
            onChange={(e) => {
              setCustomAddr(e.target.value);
              if (customResult) setCustomResult(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && !customLoading && handleTrackWallet()}
            placeholder="0x1234...abcd"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-ep-bg border border-ep-border text-sm font-mono text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50 transition"
          />
          <select
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            className="px-2 py-2 rounded-lg bg-ep-bg border border-ep-border text-xs text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent/50 shrink-0"
          >
            <option value="">Category</option>
            <option value="politics">Politics</option>
            <option value="culture">Culture</option>
            <option value="finance">Finance</option>
            <option value="mentions">Mentions</option>
            <option value="crypto">Crypto</option>
            <option value="sports">Sports</option>
          </select>
          <button
            onClick={handleTrackWallet}
            disabled={customLoading || !customAddr.trim()}
            className="px-4 py-2 rounded-lg bg-accent text-white font-semibold text-sm hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2 shrink-0"
          >
            {customLoading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Fetching...
              </>
            ) : (
              "Track"
            )}
          </button>
        </div>
        <AnimatePresence>
          {customResult && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div
                className={`mt-3 px-3 py-2 rounded-lg text-xs font-medium ${
                  customResult.type === "success"
                    ? "bg-profit/10 text-profit border border-profit/20"
                    : "bg-loss/10 text-loss border border-loss/20"
                }`}
              >
                {customResult.message}
                {customResult.type === "success" && customResult.trader && (
                  <span className="ml-2 text-text-muted">
                    {customResult.trader.trade_count || 0} trades · {(customResult.trader.win_rate || 0).toFixed(0)}% WR · {customResult.trader.bankroll_tier} tier
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Wallet Connect Prompt ────────────── */}
      <AnimatePresence>
        {connectError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 rounded-xl bg-loss/10 text-loss border border-loss/20 text-xs font-medium flex items-center gap-2">
              <span>⚠️</span>
              <span>{connectError}</span>
              <button
                onClick={() => setConnectError(null)}
                className="ml-auto text-loss/60 hover:text-loss transition"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stats Row ──────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard label="Total Traders" value={stats?.totalTraders || 0} decimals={0} />
            <StatCard label="Avg ROI" value={stats?.avgRoi || 0} suffix="%" decimals={1} colorize />
            <StatCard label="Avg Win Rate" value={stats?.avgWinRate || 0} suffix="%" decimals={1} />
            <StatCard label="Total Tracked PnL" value={stats?.totalPnl || 0} prefix="$" decimals={0} colorize />
          </>
        )}
      </div>

      {/* ── Daily Top 5 ─────────────────────────── */}
      <DailyTop5 />

      {/* ── Filters ────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <FilterBar label="Tier" options={tierOptions} value={tier} onChange={setTier} />
        <FilterBar label="Style" options={styleOptions} value={style} onChange={setStyle} />
        <FilterBar label="Category" options={categoryOptions} value={category} onChange={setCategory} />
        <div className="ml-auto">
          <SortDropdown options={sortOptions} value={sort} onChange={setSort} />
        </div>
      </div>

      {/* ── Trader Cards Grid ──────────────────── */}
      {loading ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <TraderCardSkeleton key={i} />
          ))}
        </div>
      ) : traders.length > 0 ? (
        viewMode === "grid" ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {traders.map((trader: any, i: number) => (
              <TraderCard key={trader.id} trader={trader} rank={i + 1} onFollow={handleFollowRequiresWallet} />
            ))}
          </div>
        ) : (
          /* ── Leaderboard Table View ──────────── */
          <div className="ep-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ep-border">
                    <th className="px-4 py-3 text-left text-[10px] text-text-muted uppercase tracking-wider font-semibold">#</th>
                    <th className="px-4 py-3 text-left text-[10px] text-text-muted uppercase tracking-wider font-semibold">Trader</th>
                    <th className="px-4 py-3 text-right text-[10px] text-text-muted uppercase tracking-wider font-semibold">ROI</th>
                    <th className="px-4 py-3 text-right text-[10px] text-text-muted uppercase tracking-wider font-semibold">Win Rate</th>
                    <th className="px-4 py-3 text-right text-[10px] text-text-muted uppercase tracking-wider font-semibold">PnL</th>
                    <th className="px-4 py-3 text-right text-[10px] text-text-muted uppercase tracking-wider font-semibold">Trades</th>
                    <th className="px-4 py-3 text-center text-[10px] text-text-muted uppercase tracking-wider font-semibold">Tier</th>
                    <th className="px-4 py-3 text-center text-[10px] text-text-muted uppercase tracking-wider font-semibold">Style</th>
                  </tr>
                </thead>
                <tbody>
                  {traders.map((t: any, i: number) => {
                    const roiColor = t.roi > 0 ? 'text-profit' : t.roi < 0 ? 'text-loss' : 'text-text-secondary';
                    const pnlColor = t.total_pnl > 0 ? 'text-profit' : t.total_pnl < 0 ? 'text-loss' : 'text-text-secondary';
                    const tierColors: Record<string, string> = { micro: '#A78BFA', small: '#60A5FA', mid: '#FBBF24', whale: '#34D399' };
                    const styleColors: Record<string, string> = { degen: '#F472B6', sniper: '#F97316', grinder: '#818CF8', whale: '#22D3EE' };
                    return (
                      <tr key={t.id} className="border-b border-ep-border/50 hover:bg-ep-card-hover transition">
                        <td className="px-4 py-3 font-mono text-xs text-text-muted">{i + 1}</td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-semibold text-text-primary">{t.alias || t.wallet_address?.slice(0, 10)}</span>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono text-sm font-semibold ${roiColor}`}>
                          {t.roi > 0 ? '+' : ''}{(t.roi || 0).toFixed(0)}%
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-text-primary">
                          {(t.win_rate || 0).toFixed(0)}%
                        </td>
                        <td className={`px-4 py-3 text-right font-mono text-sm ${pnlColor}`}>
                          ${Math.abs(t.total_pnl || 0) >= 1000 ? `${((t.total_pnl || 0) / 1000).toFixed(1)}K` : (t.total_pnl || 0).toFixed(0)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-text-secondary">
                          {t.trade_count || 0}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className="badge"
                            style={{
                              color: tierColors[t.bankroll_tier] || '#8B92A8',
                              background: `${tierColors[t.bankroll_tier] || '#8B92A8'}18`,
                            }}
                          >
                            {(t.bankroll_tier || 'N/A').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className="badge"
                            style={{
                              color: styleColors[t.trading_style] || '#8B92A8',
                              background: `${styleColors[t.trading_style] || '#8B92A8'}18`,
                            }}
                          >
                            {(t.trading_style || 'N/A').toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="ep-card p-12 text-center">
          <div className="text-4xl mb-3">👤</div>
          <h3 className="font-display font-semibold text-text-primary">No traders found</h3>
          <p className="text-sm text-text-muted mt-1">Try adjusting your filters or check back later.</p>
        </div>
      )}
    </div>
  );
}
