"use client";

import { useState, useRef } from "react";
import html2canvas from "html2canvas";
import { saveAs } from "file-saver";
import type { BacktestResult } from "../page";

interface ResultsActionsProps {
  backtestResult: BacktestResult;
  resultsRef: React.RefObject<HTMLDivElement>;
}

export function ResultsActions({ backtestResult, resultsRef }: ResultsActionsProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Generate share hash from strategy params
  const generateShareHash = () => {
    const data = {
      strategy: backtestResult.strategy.name,
      edge: backtestResult.strategy.edge_threshold,
      confidence: backtestResult.strategy.confidence_threshold,
      asset: backtestResult.strategy.asset,
      timeframe: backtestResult.strategy.timeframe,
    };
    return btoa(JSON.stringify(data)).replace(/[/+=]/g, "");
  };

  // Save backtest to Supabase and get share URL
  const handleSaveAndShare = async () => {
    setIsSharing(true);
    try {
      const response = await fetch("/api/lab/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy_name: backtestResult.strategy.name,
          params: backtestResult.strategy,
          results: backtestResult.metrics,
        }),
      });

      const data = await response.json();
      const hash = data.hash || generateShareHash();
      const url = `${window.location.origin}/dashboard/lab?s=${hash}`;
      setShareUrl(url);
      
      // Copy to clipboard
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to save backtest:", err);
      alert("Failed to generate share link");
    } finally {
      setIsSharing(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!backtestResult.trades || backtestResult.trades.length === 0) {
      alert("No trades to export");
      return;
    }

    // Generate CSV content
    const headers = ["Date", "Asset", "Direction", "Entry Price", "Exit Price", "Position Size", "Profit", "Edge", "Confidence"];
    const rows = backtestResult.trades.map(trade => [
      new Date(trade.timestamp).toLocaleDateString(),
      trade.asset,
      trade.direction,
      trade.entry_price.toFixed(4),
      trade.exit_price.toFixed(4),
      trade.position_size.toFixed(2),
      trade.profit.toFixed(2),
      (trade.edge * 100).toFixed(2) + "%",
      (trade.confidence * 100).toFixed(1) + "%",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(",")),
    ].join("\n");

    // Download CSV
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const filename = `backtest-${backtestResult.strategy.name}-${new Date().toISOString().split("T")[0]}.csv`;
    saveAs(blob, filename);
  };

  // Share on Twitter with image
  const handleTwitterShare = async () => {
    setIsSharing(true);
    try {
      // Capture screenshot of results
      if (!resultsRef.current) {
        throw new Error("Results not available for screenshot");
      }

      const canvas = await html2canvas(resultsRef.current, {
        backgroundColor: "#0a0a0a",
        scale: 2,
        logging: false,
      });

      // Generate tweet text
      const returnPct = backtestResult.metrics.total_return_pct.toFixed(1);
      const winRate = backtestResult.metrics.win_rate.toFixed(1);
      const strategyName = backtestResult.strategy.name;
      
      const tweetText = encodeURIComponent(
        `I backtested ${strategyName} on @EasyPoly:\n` +
        `${returnPct}% return, ${winRate}% win rate 🔥\n\n` +
        `Try it: easypoly.lol/lab`
      );

      // For now, open Twitter with text (image would require Twitter API or manual upload)
      // In production, you'd upload the canvas.toDataURL() via Twitter API
      const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;
      
      // Download image for manual attachment
      canvas.toBlob((blob) => {
        if (blob) {
          saveAs(blob, `easypoly-backtest-${Date.now()}.png`);
        }
      });

      window.open(twitterUrl, "_blank");
    } catch (err) {
      console.error("Failed to share on Twitter:", err);
      alert("Failed to generate share image");
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">Share Results</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Twitter Share */}
        <button
          onClick={handleTwitterShare}
          disabled={isSharing}
          className="flex items-center justify-center gap-2 bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Share on 𝕏
        </button>

        {/* Generate Share Link */}
        <button
          onClick={handleSaveAndShare}
          disabled={isSharing}
          className="flex items-center justify-center gap-2 bg-ep-green hover:bg-ep-green/90 text-black font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          {shareUrl ? (copied ? "✓ Copied!" : "Copy Link") : "Get Share Link"}
        </button>

        {/* Export CSV */}
        <button
          onClick={handleExportCSV}
          className="flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Share URL Display */}
      {shareUrl && (
        <div className="mt-4 p-3 bg-background border border-border rounded-lg">
          <p className="text-sm text-text-muted mb-2">Share this link:</p>
          <code className="text-sm text-ep-green break-all">{shareUrl}</code>
        </div>
      )}
    </div>
  );
}
