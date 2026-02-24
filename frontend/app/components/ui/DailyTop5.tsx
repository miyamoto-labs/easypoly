'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { TierBadge, StyleBadge, CategoryBadge } from './Badges';
import { useUserStore } from '@/app/lib/stores/user-store';
import { useToast } from './Toast';

interface Top5Trader {
  id: string;
  alias: string;
  wallet_address: string;
  roi: number;
  win_rate: number;
  trade_count: number;
  total_pnl: number;
  bankroll_tier: string;
  trading_style: string;
  composite_rank: number;
  category?: string;
  pick_score: number;
  pick_reason: string;
}

function formatPnl(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function getRankStyle(rank: number) {
  if (rank === 1) return { bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', text: 'text-yellow-400', emoji: '\u{1F947}' };
  if (rank === 2) return { bg: 'bg-gray-400/15', border: 'border-gray-400/30', text: 'text-gray-300', emoji: '\u{1F948}' };
  if (rank === 3) return { bg: 'bg-amber-600/15', border: 'border-amber-600/30', text: 'text-amber-500', emoji: '\u{1F949}' };
  return { bg: 'bg-accent/10', border: 'border-accent/20', text: 'text-accent', emoji: `${rank}` };
}

export function DailyTop5() {
  const [traders, setTraders] = useState<Top5Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const { walletAddress, isConnected, isFollowing, fetchFollows } = useUserStore();
  const { toast } = useToast();

  const fetchTop5 = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/daily-top5');
      const data = await res.json();
      setTraders(data.top5 || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCopyNow = async (trader: Top5Trader) => {
    if (!isConnected || !walletAddress) {
      toast('info', 'Connect Wallet', 'Connect your wallet to start copying traders.');
      return;
    }

    setCopyingId(trader.id);
    try {
      // 1. Toggle follow on
      const res = await fetch('/api/follows/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, traderId: trader.id }),
      });
      const data = await res.json();

      if (data.success) {
        // 2. Set default copy settings ($10/trade)
        await fetch('/api/follows/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress,
            traderId: trader.id,
            auto_trade: true,
            amount_per_trade: 10,
            max_daily_trades: 5,
          }),
        });

        await fetchFollows();
        const name = trader.alias || trader.wallet_address?.slice(0, 10);
        toast('success', `Copying ${name}`, '$10 per trade. Adjust in trader settings.');
      }
    } catch {
      toast('error', 'Copy Failed', 'Something went wrong. Try again.');
    }
    setCopyingId(null);
  };

  const handleStopCopying = async (trader: Top5Trader) => {
    if (!walletAddress) return;
    setCopyingId(trader.id);
    try {
      const res = await fetch('/api/follows/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, traderId: trader.id }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchFollows();
        toast('info', 'Stopped Copying', `No longer copying ${trader.alias || 'trader'}.`);
      }
    } catch {
      // silent
    }
    setCopyingId(null);
  };

  useEffect(() => {
    fetchTop5();
    const interval = setInterval(fetchTop5, 300000); // refresh every 5min
    return () => clearInterval(interval);
  }, [fetchTop5]);

  if (loading) {
    return (
      <div className="ep-card p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">{'\u{1F3C6}'}</span>
          <div className="h-5 w-48 bg-surface-2 rounded animate-pulse" />
        </div>
        <div className="flex gap-3 overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="min-w-[200px] h-32 bg-surface-2 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (traders.length === 0) return null;

  return (
    <motion.div
      className="ep-card p-4 sm:p-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-lg">{'\u{1F3C6}'}</span>
          <h2 className="font-display text-sm sm:text-base font-semibold">Daily Top 5</h2>
          <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent uppercase tracking-wider">
            Picks
          </span>
        </div>
      </div>
      <p className="text-[11px] text-text-muted mb-4">
        EasyPoly's recommended traders to copy today
      </p>

      {/* Scrollable trader cards */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
        {traders.map((trader, i) => {
          const rank = i + 1;
          const style = getRankStyle(rank);
          const roiColor = trader.roi > 0 ? '#00F0A0' : '#FF4060';

          return (
            <motion.div
              key={trader.id}
              className={`min-w-[200px] sm:min-w-[220px] flex-shrink-0 rounded-xl ${style.bg} border ${style.border} p-3 sm:p-4`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: i * 0.06 }}
            >
              {/* Rank + Name */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{style.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-text-primary truncate">
                      {trader.alias || trader.wallet_address?.slice(0, 8)}
                    </span>
                    <a
                      href={`https://polymarket.com/profile/${trader.wallet_address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-muted hover:text-accent transition-colors shrink-0"
                      title="View on Polymarket"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <TierBadge tier={trader.bankroll_tier} />
                    {trader.trading_style !== trader.bankroll_tier && (
                      <StyleBadge style={trader.trading_style} />
                    )}
                    {trader.category && <CategoryBadge category={trader.category} />}
                  </div>
                </div>
              </div>

              {/* ROI + Stats */}
              <div className="flex items-end justify-between mb-2">
                <div>
                  <div className="font-mono text-xl font-bold" style={{ color: roiColor }}>
                    {trader.roi > 0 ? '+' : ''}{trader.roi.toFixed(0)}%
                  </div>
                  <div className="text-[10px] text-text-muted">ROI</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs text-text-secondary">
                    {trader.win_rate.toFixed(0)}% WR
                  </div>
                  <div className="text-[10px] text-text-muted">
                    {formatPnl(trader.total_pnl)} PnL
                  </div>
                </div>
              </div>

              {/* Pick reason */}
              <div className="text-[10px] text-text-muted leading-tight border-t border-white/5 pt-2 mb-2">
                {trader.pick_reason}
              </div>

              {/* Copy Now button */}
              {isFollowing(trader.id) ? (
                <button
                  onClick={() => handleStopCopying(trader)}
                  disabled={copyingId === trader.id}
                  className="w-full py-1.5 rounded-lg text-[11px] font-semibold bg-profit/10 text-profit border border-profit/20 hover:bg-loss/10 hover:text-loss hover:border-loss/20 disabled:opacity-50 transition group"
                >
                  {copyingId === trader.id ? (
                    'Stopping...'
                  ) : (
                    <>
                      <span className="group-hover:hidden">Copying ★</span>
                      <span className="hidden group-hover:inline">Stop Copying</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => handleCopyNow(trader)}
                  disabled={copyingId === trader.id}
                  className="w-full py-1.5 rounded-lg text-[11px] font-bold bg-accent text-ep-bg hover:bg-accent/90 disabled:opacity-50 transition"
                >
                  {copyingId === trader.id ? 'Starting...' : 'Copy Now'}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
