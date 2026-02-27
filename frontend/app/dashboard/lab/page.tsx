"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { StrategyBuilder } from "./components/StrategyBuilder";
import { ResultsChart } from "./components/ResultsChart";
import { TradesTable } from "./components/TradesTable";
import { MetricsCards } from "./components/MetricsCards";
import { ResultsActions } from "./components/ResultsActions";

export interface BacktestResult {
  strategy: {
    name: string;
    edge_threshold: number;
    confidence_threshold: number;
    position_size: number;
    timeframe: string;
    asset: string;
  };
  metrics: {
    total_return: number;
    total_return_pct: number;
    win_rate: number;
    sharpe_ratio: number;
    max_drawdown: number;
    max_drawdown_pct: number;
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    avg_win: number;
    avg_loss: number;
    largest_win: number;
    largest_loss: number;
    profit_factor: number;
  };
  trades: Array<{
    timestamp: string;
    asset: string;
    direction: string;
    entry_price: number;
    exit_price: number;
    position_size: number;
    profit: number;
    edge: number;
    confidence: number;
    outcome: number;
  }>;
  equity_curve: Array<{
    date: string;
    equity: number;
  }>;
}

export default function StrategyLabPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resultsRef = useRef<HTMLDivElement>(null);
  
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Load shared strategy from URL
  useEffect(() => {
    const shareHash = searchParams.get("s");
    if (shareHash) {
      loadSharedStrategy(shareHash);
    }
  }, [searchParams]);

  const loadSharedStrategy = async (hash: string) => {
    setIsLoading(true);
    setLoadingProgress(20);
    
    try {
      const response = await fetch(`/api/lab/share?hash=${hash}`);
      setLoadingProgress(50);
      
      if (!response.ok) {
        throw new Error("Shared strategy not found");
      }

      const data = await response.json();
      setLoadingProgress(80);
      
      // Run backtest with loaded params
      await handleBacktest({
        strategy_name: data.strategy_name,
        custom_params: data.params,
        days_back: 30, // Default
        asset: data.params.asset,
      });
      
      setLoadingProgress(100);
    } catch (err) {
      console.error("Failed to load shared strategy:", err);
      setError("Failed to load shared strategy. It may have been deleted.");
    } finally {
      setIsLoading(false);
      setLoadingProgress(0);
    }
  };

  const handleBacktest = async (params: {
    strategy_name?: string;
    custom_params?: any;
    days_back: number;
    asset: string;
  }) => {
    setIsLoading(true);
    setError(null);
    setLoadingProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => Math.min(prev + 10, 90));
    }, 200);

    try {
      const response = await fetch("/api/backtest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`Backtest failed: ${response.statusText}`);
      }

      const result = await response.json();
      setLoadingProgress(100);
      setBacktestResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run backtest");
      console.error("Backtest error:", err);
    } finally {
      clearInterval(progressInterval);
      setIsLoading(false);
      setTimeout(() => setLoadingProgress(0), 500);
    }
  };

  const handleRetry = () => {
    setError(null);
    setBacktestResult(null);
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="border-b border-border pb-4 sm:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
                Strategy Lab 🧪
              </h1>
              <p className="text-text-muted text-base sm:text-lg">
                Backtest trading strategies against historical Synthdata predictions
              </p>
            </div>
            <button
              onClick={() => router.push("/dashboard/lab/leaderboard")}
              className="bg-card border border-border hover:bg-background text-foreground font-medium py-2 px-4 rounded-lg transition-colors whitespace-nowrap"
            >
              🏆 Leaderboard
            </button>
          </div>
        </div>

        {/* Strategy Builder */}
        <StrategyBuilder onBacktest={handleBacktest} isLoading={isLoading} />

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-red-400 font-medium mb-2">❌ {error}</p>
                <p className="text-red-400/70 text-sm">
                  Check your internet connection and try again.
                </p>
              </div>
              <button
                onClick={handleRetry}
                className="bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium py-2 px-4 rounded-lg transition-colors whitespace-nowrap"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ep-green"></div>
            <p className="text-text-muted text-sm">Running backtest...</p>
            {loadingProgress > 0 && (
              <div className="w-full max-w-md">
                <div className="bg-background border border-border rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-ep-green h-full transition-all duration-300"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>
                <p className="text-center text-text-muted text-xs mt-2">
                  {loadingProgress}%
                </p>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {backtestResult && !isLoading && (
          <div ref={resultsRef} className="space-y-6">
            {/* Strategy Info */}
            <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-4">
                {backtestResult.strategy.name}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-sm">
                <div>
                  <span className="text-text-muted block mb-1">Asset:</span>
                  <span className="font-medium text-foreground">
                    {backtestResult.strategy.asset}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block mb-1">Timeframe:</span>
                  <span className="font-medium text-foreground">
                    {backtestResult.strategy.timeframe}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block mb-1">Edge:</span>
                  <span className="font-medium text-foreground">
                    {(backtestResult.strategy.edge_threshold * 100).toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block mb-1">Confidence:</span>
                  <span className="font-medium text-foreground">
                    {(backtestResult.strategy.confidence_threshold * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Metrics Cards */}
            <MetricsCards metrics={backtestResult.metrics} />

            {/* Share Actions */}
            <ResultsActions 
              backtestResult={backtestResult}
              resultsRef={resultsRef}
            />

            {/* Equity Curve */}
            <ResultsChart equityCurve={backtestResult.equity_curve} />

            {/* Trades Table */}
            <TradesTable trades={backtestResult.trades} />
          </div>
        )}

        {/* Empty State */}
        {!backtestResult && !isLoading && !error && (
          <div className="text-center py-12">
            <p className="text-text-muted text-lg">
              Select a strategy and run a backtest to see results 📊
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
