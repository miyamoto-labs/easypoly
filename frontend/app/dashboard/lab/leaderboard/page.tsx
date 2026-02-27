"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface LeaderboardEntry {
  id: string;
  hash: string;
  strategy_name: string;
  params: {
    asset: string;
    timeframe: string;
    edge_threshold: number;
    confidence_threshold: number;
  };
  results: {
    total_return_pct: number;
    win_rate: number;
    total_trades: number;
    sharpe_ratio: number;
  };
  shares_count: number;
  created_at: string;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"return" | "winrate" | "shares">("return");

  useEffect(() => {
    fetchLeaderboard();
  }, [sortBy]);

  const fetchLeaderboard = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("lab_backtests")
        .select("*")
        .order(
          sortBy === "return"
            ? "results->total_return_pct"
            : sortBy === "winrate"
            ? "results->win_rate"
            : "shares_count",
          { ascending: false }
        )
        .limit(10);

      if (error) throw error;
      setLeaderboard(data || []);
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadStrategy = (hash: string) => {
    router.push(`/dashboard/lab?s=${hash}`);
  };

  const getRankEmoji = (index: number) => {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `${index + 1}`;
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="border-b border-border pb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">
                🏆 Leaderboard
              </h1>
              <p className="text-text-muted text-lg">
                Top performing backtested strategies
              </p>
            </div>
            <button
              onClick={() => router.push("/dashboard/lab")}
              className="bg-ep-green hover:bg-ep-green/90 text-black font-medium py-2 px-4 rounded-lg transition-colors"
            >
              ← Back to Lab
            </button>
          </div>
        </div>

        {/* Sort Options */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSortBy("return")}
            className={`py-2 px-4 rounded-lg font-medium transition-colors ${
              sortBy === "return"
                ? "bg-ep-green text-black"
                : "bg-card border border-border text-text-muted hover:text-foreground"
            }`}
          >
            📈 Best Return
          </button>
          <button
            onClick={() => setSortBy("winrate")}
            className={`py-2 px-4 rounded-lg font-medium transition-colors ${
              sortBy === "winrate"
                ? "bg-ep-green text-black"
                : "bg-card border border-border text-text-muted hover:text-foreground"
            }`}
          >
            🎯 Win Rate
          </button>
          <button
            onClick={() => setSortBy("shares")}
            className={`py-2 px-4 rounded-lg font-medium transition-colors ${
              sortBy === "shares"
                ? "bg-ep-green text-black"
                : "bg-card border border-border text-text-muted hover:text-foreground"
            }`}
          >
            🔥 Most Shared
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ep-green"></div>
          </div>
        )}

        {/* Leaderboard Table */}
        {!isLoading && leaderboard.length > 0 && (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background/50">
                  <tr className="text-left text-text-muted text-sm">
                    <th className="p-4 font-medium">Rank</th>
                    <th className="p-4 font-medium">Strategy</th>
                    <th className="p-4 font-medium">Asset</th>
                    <th className="p-4 font-medium">Return</th>
                    <th className="p-4 font-medium">Win Rate</th>
                    <th className="p-4 font-medium">Trades</th>
                    <th className="p-4 font-medium">Sharpe</th>
                    <th className="p-4 font-medium">Shares</th>
                    <th className="p-4 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, index) => (
                    <tr
                      key={entry.id}
                      className="border-t border-border hover:bg-background/30 transition-colors"
                    >
                      <td className="p-4 font-bold text-xl">
                        {getRankEmoji(index)}
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-foreground">
                          {entry.strategy_name}
                        </div>
                        <div className="text-xs text-text-muted">
                          {entry.params.timeframe}
                        </div>
                      </td>
                      <td className="p-4 text-foreground">
                        {entry.params.asset}
                      </td>
                      <td className="p-4">
                        <span
                          className={`font-bold ${
                            entry.results.total_return_pct > 0
                              ? "text-ep-green"
                              : "text-red-400"
                          }`}
                        >
                          {entry.results.total_return_pct > 0 ? "+" : ""}
                          {entry.results.total_return_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-4 text-foreground">
                        {entry.results.win_rate.toFixed(1)}%
                      </td>
                      <td className="p-4 text-foreground">
                        {entry.results.total_trades}
                      </td>
                      <td className="p-4 text-foreground">
                        {entry.results.sharpe_ratio.toFixed(2)}
                      </td>
                      <td className="p-4 text-text-muted">
                        {entry.shares_count}
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => handleLoadStrategy(entry.hash)}
                          className="bg-ep-green/20 hover:bg-ep-green/30 text-ep-green font-medium py-1 px-3 rounded text-sm transition-colors"
                        >
                          Try It
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && leaderboard.length === 0 && (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <p className="text-text-muted text-lg mb-4">
              No backtests shared yet 📊
            </p>
            <p className="text-text-muted text-sm">
              Be the first to run a backtest and share your results!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
