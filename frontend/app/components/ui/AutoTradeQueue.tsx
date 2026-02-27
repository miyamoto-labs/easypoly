'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DirectionBadge, TierBadge } from './Badges';
import { useToast } from './Toast';
import { useUserStore } from '@/app/lib/stores/user-store';
import { useTradeExecution } from '@/app/lib/hooks/useTradeExecution';
import { usePrivyClobClient } from '@/app/lib/hooks/usePrivyClobClient';

/* ── Types ──────────────────────────────────────── */
interface PendingTrade {
  signalId: string;
  traderId: string;
  traderAlias: string;
  traderRoi: number;
  traderWinRate: number;
  traderTier: string;
  traderStyle: string;
  marketId: string;
  marketQuestion: string;
  marketCategory: string;
  direction: string;
  traderAmount: number;
  traderPrice: number;
  currentYesPrice: number;
  currentNoPrice: number;
  yesToken: string;
  noToken: string;
  suggestedAmount: number;
  timestamp: string;
}

interface QueueStats {
  dailyUsed: number;
  dailyLimit: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ── Component ──────────────────────────────────── */
export function AutoTradeQueue() {
  const { walletAddress, isConnected, follows } = useUserStore();
  const { executeTrade } = useTradeExecution();
  const { createOrder: privyCreateOrder, isReady: privyReady, safeAddress } = usePrivyClobClient();
  const { toast } = useToast();

  const [pending, setPending] = useState<PendingTrade[]>([]);
  const [stats, setStats] = useState<QueueStats>({ dailyUsed: 0, dailyLimit: 0 });
  const [loading, setLoading] = useState(true);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [executingAll, setExecutingAll] = useState(false);
  const [autoExecuting, setAutoExecuting] = useState(false);

  // Track signals we've already attempted to auto-execute (prevents double-firing)
  const attemptedRef = useRef<Set<string>>(new Set());
  const autoExecutingRef = useRef(false);

  // Only show if user has auto-trade enabled on any follow
  const hasAutoTradeFollows = follows.some((f) => f.autoTrade);

  const fetchQueue = useCallback(async () => {
    if (!walletAddress || !hasAutoTradeFollows) return;
    try {
      const res = await fetch(`/api/auto-trade/queue?wallet=${walletAddress}`);
      if (res.ok) {
        const data = await res.json();
        setPending(data.pendingTrades || []);
        setStats(data.stats || { dailyUsed: 0, dailyLimit: 0 });
      }
    } catch (err) {
      console.error('Auto-trade queue fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, hasAutoTradeFollows]);

  useEffect(() => {
    if (!isConnected || !walletAddress || !hasAutoTradeFollows) {
      setLoading(false);
      return;
    }
    fetchQueue();
    const interval = setInterval(fetchQueue, 30000);
    return () => clearInterval(interval);
  }, [fetchQueue, isConnected, walletAddress, hasAutoTradeFollows]);

  // Don't render if no auto-trade follows or not connected
  if (!isConnected || !hasAutoTradeFollows) return null;
  if (loading) return null;
  if (pending.length === 0) return null;

  const handleExecute = async (trade: PendingTrade) => {
    setExecutingId(trade.signalId);
    try {
      const price =
        trade.direction === 'YES' ? trade.currentYesPrice : trade.currentNoPrice;

      if (!price || price <= 0) {
        toast('error', 'Trade Failed', 'Market price unavailable');
        return;
      }

      // Resolve the actual CLOB token ID (not the market slug)
      const tokenID = trade.direction === 'YES' ? trade.yesToken : trade.noToken;
      if (!tokenID) {
        toast('error', 'Trade Failed', 'Token ID not available for this market');
        return;
      }

      // Ensure the order meets the CLOB's $1 minimum after rounding
      const effectiveAmount = Math.max(trade.suggestedAmount, 1.01);
      const rawSize = effectiveAmount / price;
      const size = Math.ceil(rawSize * 100) / 100; // Round up to 2 decimals
      let orderSuccess = false;
      let orderId: string | undefined;
      let errorMsg: string | undefined;

      // ── Try Privy silent signing first (no popup) ──
      if (privyReady && privyCreateOrder) {
        try {
          console.log(`[AutoTrade] Using Privy signing for signal ${trade.signalId}`);
          const result = await privyCreateOrder({
            tokenID: tokenID,
            side: 'BUY',
            size,
            price,
          });
          console.log('[AutoTrade] Privy order result:', JSON.stringify(result));

          if (result?.errorMsg || result?.error) {
            errorMsg = result.errorMsg || result.error;
            console.error('[AutoTrade] CLOB rejected order:', errorMsg);
          } else {
            orderSuccess = true;
            orderId = result?.orderID || result?.id;
          }
        } catch (err: any) {
          console.error('[AutoTrade] Privy execution failed:', err?.message);
          errorMsg = err?.message || 'Privy signing failed';
        }
      }

      // ── Fallback: MetaMask signing (requires popup) ──
      if (!orderSuccess && !privyReady) {
        console.log(`[AutoTrade] Using MetaMask fallback for signal ${trade.signalId}`);
        const result = await executeTrade({
          tokenId: tokenID,
          side: 'BUY',
          amount: trade.suggestedAmount,
          price,
          direction: trade.direction,
          source: 'auto-trade',
          sourceId: trade.signalId,
        });

        if (result.success) {
          orderSuccess = true;
          orderId = result.orderID;
        } else {
          errorMsg = result.error || 'Something went wrong';
        }
      }

      if (orderSuccess) {
        // Log the execution
        await fetch('/api/auto-trade/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: safeAddress || walletAddress,
            signalId: trade.signalId,
            traderId: trade.traderId,
            orderId: orderId || 'unknown',
            amount: trade.suggestedAmount,
          }),
        });

        // Also log to server trade history
        try {
          await fetch('/api/trade/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              walletAddress: safeAddress || walletAddress,
              tokenId: tokenID,
              side: 'BUY',
              direction: trade.direction,
              amount: trade.suggestedAmount,
              price,
              orderId: orderId || 'unknown',
              source: 'auto-trade',
              sourceId: trade.signalId,
            }),
          });
        } catch {
          // Non-critical — continue even if server log fails
        }

        toast('success', 'Auto-Trade Executed!', `$${trade.suggestedAmount} ${trade.direction} placed`);

        // Remove from pending
        setPending((prev) => prev.filter((p) => p.signalId !== trade.signalId));
        setStats((prev) => ({ ...prev, dailyUsed: prev.dailyUsed + 1 }));
      } else {
        toast('error', 'Trade Failed', errorMsg || 'Something went wrong');
      }
    } catch (err: any) {
      toast('error', 'Trade Failed', err.message || 'Something went wrong');
    } finally {
      setExecutingId(null);
    }
  };

  const handleDismiss = async (trade: PendingTrade) => {
    try {
      await fetch('/api/auto-trade/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: walletAddress,
          signalId: trade.signalId,
        }),
      });
      setPending((prev) => prev.filter((p) => p.signalId !== trade.signalId));
    } catch {
      // Silent fail — they can dismiss again
    }
  };

  const handleExecuteAll = async () => {
    setExecutingAll(true);
    for (const trade of pending) {
      await handleExecute(trade);
      // Small delay between trades to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    }
    setExecutingAll(false);
  };

  // ── Auto-execution: fire trades automatically when Privy is ready ──
  useEffect(() => {
    if (!privyReady || !privyCreateOrder) return;
    if (autoExecutingRef.current) return;
    if (pending.length === 0) return;

    // Find signals we haven't attempted yet and are fresh (< 5 min old)
    const MAX_AGE_MS = 5 * 60 * 1000;
    const now = Date.now();
    const newTrades = pending.filter((t) => {
      if (attemptedRef.current.has(t.signalId)) return false;
      const age = now - new Date(t.timestamp).getTime();
      return age < MAX_AGE_MS;
    });

    if (newTrades.length === 0) return;

    autoExecutingRef.current = true;
    setAutoExecuting(true);

    (async () => {
      for (const trade of newTrades) {
        attemptedRef.current.add(trade.signalId);
        console.log(`[AutoTrade] Auto-executing signal ${trade.signalId} for ${trade.traderAlias} — $${trade.suggestedAmount} ${trade.direction}`);
        await handleExecute(trade);
        await new Promise((r) => setTimeout(r, 500));
      }
      autoExecutingRef.current = false;
      setAutoExecuting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, privyReady, privyCreateOrder]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <h2 className="font-display text-lg font-bold">Auto-Trade Queue</h2>
            {autoExecuting ? (
              <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-bold text-accent animate-pulse flex items-center gap-1">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Executing...
              </span>
            ) : (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">
                {pending.length}
              </span>
            )}
          </div>

          {/* Daily limit */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-text-muted">
            <div className="w-16 h-1.5 bg-ep-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{
                  width: `${stats.dailyLimit > 0 ? (stats.dailyUsed / stats.dailyLimit) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="font-mono">
              {stats.dailyUsed}/{stats.dailyLimit} today
            </span>
          </div>
        </div>

        {pending.length > 1 && (
          <button
            onClick={handleExecuteAll}
            disabled={executingAll}
            className="btn-accent text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
          >
            {executingAll ? 'Executing...' : `Execute All (${pending.length})`}
          </button>
        )}
      </div>

      {/* Pending Trade Cards */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {pending.map((trade, i) => {
            const isExecuting = executingId === trade.signalId;
            const currentPrice =
              trade.direction === 'YES'
                ? trade.currentYesPrice
                : trade.currentNoPrice;

            return (
              <motion.div
                key={trade.signalId}
                className="ep-card p-4"
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 60, height: 0, marginBottom: 0, padding: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: signal info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {/* Trader avatar */}
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{
                          background: 'rgba(0, 240, 160, 0.15)',
                          color: '#00F0A0',
                        }}
                      >
                        {trade.traderAlias[0]?.toUpperCase() || '?'}
                      </div>
                      <span className="text-sm font-semibold text-text-primary truncate">
                        {trade.traderAlias}
                      </span>
                      {trade.traderTier && <TierBadge tier={trade.traderTier} />}
                      <DirectionBadge direction={trade.direction} />
                    </div>

                    <p className="text-xs text-text-secondary leading-snug truncate sm:whitespace-normal">
                      {trade.marketQuestion}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-text-muted">
                      <span>
                        Trader: <span className="font-mono text-text-secondary">${trade.traderAmount.toFixed(0)}</span> at{' '}
                        <span className="font-mono text-text-secondary">{(trade.traderPrice * 100).toFixed(0)}c</span>
                      </span>
                      <span>
                        Now: <span className="font-mono text-text-secondary">{(currentPrice * 100).toFixed(0)}c</span>
                      </span>
                      <span>{timeAgo(trade.timestamp)}</span>
                    </div>
                  </div>

                  {/* Right: action buttons */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => handleExecute(trade)}
                      disabled={isExecuting || executingAll}
                      className="btn-accent text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap disabled:opacity-50"
                    >
                      {isExecuting ? 'Placing...' : `$${trade.suggestedAmount}`}
                    </button>
                    <button
                      onClick={() => handleDismiss(trade)}
                      disabled={isExecuting}
                      className="text-[10px] text-text-muted hover:text-text-secondary transition text-center"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Mobile daily limit (shown below cards) */}
      <div className="flex sm:hidden items-center justify-center gap-2 text-xs text-text-muted">
        <div className="w-20 h-1.5 bg-ep-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all"
            style={{
              width: `${stats.dailyLimit > 0 ? (stats.dailyUsed / stats.dailyLimit) * 100 : 0}%`,
            }}
          />
        </div>
        <span className="font-mono">
          {stats.dailyUsed}/{stats.dailyLimit} auto-trades today
        </span>
      </div>
    </div>
  );
}
