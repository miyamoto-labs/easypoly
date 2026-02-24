"use client";

import { useEffect, useState, useCallback } from "react";
import StatsGrid from "../components/StatsGrid";
import { useUserStore } from "@/app/lib/stores/user-store";
import { AutoTradeQueue } from "@/app/components/ui/AutoTradeQueue";

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr || "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function RankBar({ rank }: { rank: number }) {
  const pct = Math.min(rank * 100, 100);
  return (
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/5">
      <div
        className="h-full rounded-full bg-accent transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface Trader {
  id: string;
  wallet_address: string;
  alias: string;
  total_pnl: number;
  pnl_30d: number;
  pnl_7d: number;
  win_rate: number;
  trade_count: number;
  composite_rank: number;
  avg_position_size: number;
  market_categories: string[];
  profile_summary: string;
  last_updated: string;
}

interface Signal {
  id: string;
  trader_id: string;
  market_id: string;
  direction: string;
  amount: number;
  price: number;
  trade_type: string;
  timestamp: string;
  ep_tracked_traders: {
    alias: string;
    wallet_address: string;
    composite_rank: number;
    total_pnl: number;
  } | null;
  market: {
    market_id: string;
    question: string;
    category: string;
    yes_price: number;
    no_price: number;
  } | null;
}

type TabFilter = "all" | "my";

export default function ShadowPage() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>("all");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { followedTraderIds, isConnected, walletAddress, follows, fetchFollows } = useUserStore();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/dashboard/shadow");
        const data = await res.json();
        setTraders(data.traders || []);
        setSignals(data.signals || []);
        setStats(data.stats || {});
      } catch (err) {
        console.error("Failed to load shadow data:", err);
      }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch follows on mount if connected
  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchFollows();
    }
  }, [isConnected, walletAddress, fetchFollows]);

  const handleToggleFollow = useCallback(async (traderId: string) => {
    if (!walletAddress) return;
    setTogglingId(traderId);
    try {
      await fetch("/api/follows/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, traderId }),
      });
      await fetchFollows();
    } catch (err) {
      console.error("Follow toggle error:", err);
    } finally {
      setTogglingId(null);
    }
  }, [walletAddress, fetchFollows]);

  const handleToggleAutoTrade = useCallback(async (traderId: string, currentValue: boolean) => {
    if (!walletAddress) return;
    try {
      await fetch("/api/follows/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          traderId,
          auto_trade: !currentValue,
        }),
      });
      await fetchFollows();
    } catch (err) {
      console.error("Auto-trade toggle error:", err);
    }
  }, [walletAddress, fetchFollows]);

  // Filter by followed traders
  const filteredTraders =
    tab === "my"
      ? traders.filter((t) => followedTraderIds.includes(t.id))
      : traders;

  const filteredSignals =
    tab === "my"
      ? signals.filter((s) => followedTraderIds.includes(s.trader_id))
      : signals;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-gray-400">
        <svg className="mr-2 h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading shadow data...
      </div>
    );
  }

  const statsCards = [
    {
      label: "Tracked Traders",
      value: String(stats?.total_traders || 0),
      icon: "picks",
      sub: "Active whale wallets",
    },
    {
      label: "Copy Signals",
      value: String(stats?.total_signals || 0),
      icon: "winrate",
      sub: "Positions detected",
    },
    {
      label: "Avg Rank",
      value: stats?.avg_rank ? `${(stats.avg_rank * 100).toFixed(1)}%` : "0%",
      icon: "markets",
      sub: "Composite score",
    },
    {
      label: "Total PnL Tracked",
      value: stats?.total_tracked_pnl
        ? `$${Number(stats.total_tracked_pnl).toLocaleString()}`
        : "$0",
      icon: "pnl",
      sub: "Combined trader profit",
      trend: (stats?.total_tracked_pnl || 0) > 0 ? ("up" as const) : ("neutral" as const),
    },
  ];

  // Helper to get follow record for a trader
  const getFollowRecord = (traderId: string) =>
    follows.find((f) => f.traderId === traderId);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            The Shadow
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Tracking top Polymarket traders and mirroring their moves
          </p>
        </div>

        {/* Tab Switcher */}
        {isConnected && followedTraderIds.length > 0 && (
          <div className="flex rounded-lg border border-ep-border overflow-hidden text-xs">
            <button
              onClick={() => setTab("all")}
              className={`px-3 py-1.5 font-medium transition ${
                tab === "all"
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              All Traders
            </button>
            <button
              onClick={() => setTab("my")}
              className={`px-3 py-1.5 font-medium transition border-l border-ep-border ${
                tab === "my"
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              My Traders
              <span className="ml-1 text-[10px] opacity-60">
                ({followedTraderIds.length})
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <StatsGrid stats={statsCards} />

      {/* Auto-Trade Queue — shows pending copy signals ready to execute */}
      {isConnected && <AutoTradeQueue />}

      {/* Tracked Traders */}
      <div>
        <h2 className="text-lg font-semibold">
          {tab === "my" ? "My Copied Traders" : "Tracked Traders"}
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          {tab === "my"
            ? "Traders you're copying and monitoring"
            : "Top wallets ranked by PnL, win rate, trade volume, and recency"}
        </p>

        {filteredTraders.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-3 py-3">Rank</th>
                  <th className="px-3 py-3">Trader</th>
                  <th className="px-3 py-3">Wallet</th>
                  <th className="px-3 py-3 text-right">Total PnL</th>
                  <th className="px-3 py-3 text-right">Win Rate</th>
                  <th className="px-3 py-3 text-right">Trades</th>
                  <th className="px-3 py-3">Score</th>
                  {isConnected && <th className="px-3 py-3 text-center">Copy</th>}
                  {isConnected && <th className="px-3 py-3 text-center">Auto-Trade</th>}
                </tr>
              </thead>
              <tbody>
                {filteredTraders.map((trader, idx) => {
                  const isFollowed = followedTraderIds.includes(trader.id);
                  const followRecord = getFollowRecord(trader.id);
                  const isToggling = togglingId === trader.id;

                  return (
                    <tr
                      key={trader.id}
                      className={`border-b border-white/5 transition hover:bg-white/[0.02] ${
                        isFollowed ? "bg-accent/[0.03]" : ""
                      }`}
                    >
                      <td className="px-3 py-3">
                        <span className="font-mono text-accent">#{idx + 1}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{trader.alias || "Unknown"}</span>
                          {isFollowed && (
                            <span className="text-[10px] text-accent">★</span>
                          )}
                        </div>
                        {trader.profile_summary && (
                          <div className="mt-0.5 text-xs text-gray-500 line-clamp-1">
                            {trader.profile_summary}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <a
                          href={`https://polygonscan.com/address/${trader.wallet_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-gray-400 transition hover:text-accent"
                        >
                          {shortenAddress(trader.wallet_address)}
                        </a>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span
                          className={`font-mono font-medium ${
                            trader.total_pnl > 0
                              ? "text-emerald-400"
                              : trader.total_pnl < 0
                              ? "text-red-400"
                              : "text-gray-400"
                          }`}
                        >
                          {trader.total_pnl > 0 ? "+" : ""}
                          ${Math.abs(trader.total_pnl).toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {trader.win_rate > 0
                          ? `${(trader.win_rate > 1 ? trader.win_rate : trader.win_rate * 100).toFixed(
                              0
                            )}%`
                          : "--"}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-gray-400">
                        {trader.trade_count || "--"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <RankBar rank={trader.composite_rank} />
                          <span className="font-mono text-xs text-gray-500">
                            {(trader.composite_rank * 100).toFixed(0)}
                          </span>
                        </div>
                      </td>

                      {/* Follow/Unfollow button */}
                      {isConnected && (
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => handleToggleFollow(trader.id)}
                            disabled={isToggling}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition disabled:opacity-50 ${
                              isFollowed
                                ? "bg-accent/15 text-accent hover:bg-accent/25"
                                : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            {isToggling ? "..." : isFollowed ? "Copying" : "Copy"}
                          </button>
                        </td>
                      )}

                      {/* Auto-Trade toggle */}
                      {isConnected && (
                        <td className="px-3 py-3 text-center">
                          {isFollowed ? (
                            <button
                              onClick={() => handleToggleAutoTrade(trader.id, followRecord?.autoTrade || false)}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
                                followRecord?.autoTrade
                                  ? "bg-accent"
                                  : "bg-white/10"
                              }`}
                              title={followRecord?.autoTrade
                                ? `Auto-trading $${followRecord.amountPerTrade}/trade, max ${followRecord.maxDailyTrades}/day`
                                : "Enable auto-trade to copy this trader's moves"
                              }
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5 ${
                                  followRecord?.autoTrade ? "translate-x-[18px]" : "translate-x-0.5"
                                }`}
                              />
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-600">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-white/5 bg-ep-card p-8 text-center">
            <p className="text-gray-400">
              {tab === "my"
                ? "You're not copying any traders yet."
                : "No tracked traders yet."}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              {tab === "my"
                ? "Copy traders from the All Traders tab to see them here."
                : "The Shadow scans for top Polymarket wallets every cycle."}
            </p>
          </div>
        )}
      </div>

      {/* Copy Signals */}
      <div>
        <h2 className="text-lg font-semibold">
          {tab === "my" ? "Signals from My Traders" : "Recent Copy Signals"}
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          {tab === "my"
            ? "New positions from traders you copy"
            : "New positions detected from tracked traders"}
        </p>

        {filteredSignals.length > 0 ? (
          <div className="mt-4 space-y-3">
            {filteredSignals.map((signal) => {
              const isFollowed = followedTraderIds.includes(signal.trader_id);
              return (
                <div
                  key={signal.id}
                  className={`rounded-xl border border-white/5 bg-ep-card p-4 transition hover:border-white/10 ${
                    isFollowed ? "border-accent/10" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {/* Trader + direction */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-violet-500/20 px-2 py-0.5 text-xs font-semibold text-violet-400">
                          {signal.ep_tracked_traders?.alias || "Unknown"}
                        </span>
                        {isFollowed && (
                          <span className="text-[10px] text-accent">★</span>
                        )}
                        <span className="text-xs text-gray-500">entered</span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-bold ${
                            signal.direction === "YES"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {signal.direction}
                        </span>
                      </div>

                      {/* Market question */}
                      <p className="mt-2 text-sm font-medium leading-snug">
                        {signal.market?.question || signal.market_id}
                      </p>

                      {/* Meta */}
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                        <span>
                          Size:{" "}
                          <span className="font-mono text-white">
                            ${Number(signal.amount).toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </span>
                        </span>
                        <span>
                          Price:{" "}
                          <span className="font-mono text-white">
                            {Number(signal.price).toFixed(2)}
                          </span>
                        </span>
                        {signal.market?.category && (
                          <span className="rounded bg-white/5 px-1.5 py-0.5">
                            {signal.market.category}
                          </span>
                        )}
                        {signal.ep_tracked_traders?.total_pnl !== undefined && (
                          <span>
                            Trader PnL:{" "}
                            <span
                              className={`font-mono ${
                                (signal.ep_tracked_traders.total_pnl || 0) > 0
                                  ? "text-emerald-400"
                                  : "text-red-400"
                              }`}
                            >
                              ${Number(
                                signal.ep_tracked_traders.total_pnl
                              ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right side: timestamp + follow button */}
                    <div className="shrink-0 text-right space-y-2">
                      <span className="text-xs text-gray-500">
                        {timeAgo(signal.timestamp)}
                      </span>
                      {isConnected && !isFollowed && (
                        <button
                          onClick={() => handleToggleFollow(signal.trader_id)}
                          className="block text-[10px] text-accent hover:underline"
                        >
                          + Copy
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-white/5 bg-ep-card p-8 text-center">
            <p className="text-gray-400">
              {tab === "my"
                ? "No signals from your copied traders yet."
                : "No copy signals detected yet."}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              {tab === "my"
                ? "Signals will appear when your copied traders enter new positions."
                : "Signals appear when tracked traders enter new positions worth $100+."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
