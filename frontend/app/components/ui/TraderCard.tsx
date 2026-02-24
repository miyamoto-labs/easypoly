'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TierBadge, StyleBadge, CategoryBadge } from './Badges';
import { useUserStore } from '@/app/lib/stores/user-store';
import { useToast } from './Toast';

interface Trader {
  id: string;
  wallet_address: string;
  alias: string;
  total_pnl: number;
  win_rate: number;
  trade_count: number;
  composite_rank: number;
  roi: number;
  bankroll_tier: string;
  trading_style: string;
  estimated_bankroll: number;
  markets_traded: number;
  category?: string;
  recent_trades?: Array<{
    id: string;
    market_id: string;
    direction: string;
    amount: number;
    price: number;
    timestamp: string;
    market?: { question: string };
  }>;
}

interface TraderCardProps {
  trader: Trader;
  rank?: number;
  onFollow?: (trader: Trader) => void;
  isFollowed?: boolean;
  className?: string;
}

function formatUsd(val: number) {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

const AMOUNT_PRESETS = [5, 10, 25, 50, 100];

export function TraderCard({ trader, rank, onFollow, isFollowed: isFollowedProp, className = '' }: TraderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showCopySetup, setShowCopySetup] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [copyAmount, setCopyAmount] = useState(10);
  const [showAutoSettings, setShowAutoSettings] = useState(false);
  const [autoTrade, setAutoTrade] = useState(false);
  const [maxDailyTrades, setMaxDailyTrades] = useState(5);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const { walletAddress, isConnected, isFollowing, fetchFollows, follows } = useUserStore();
  const { toast } = useToast();
  const roiColor = trader.roi > 0 ? '#00F0A0' : trader.roi < 0 ? '#FF4060' : '#8B92A8';

  // Use store state, fall back to prop for SSR
  const followed = isFollowedProp ?? isFollowing(trader.id);

  // Load settings from store when available
  const followRecord = follows.find((f) => f.traderId === trader.id);

  // Sync state from store when followRecord changes
  useEffect(() => {
    if (followRecord) {
      setCopyAmount(followRecord.amountPerTrade);
      setAutoTrade(followRecord.autoTrade);
      setMaxDailyTrades(followRecord.maxDailyTrades);
    }
  }, [followRecord]);

  const handleCopyClick = () => {
    if (!isConnected || !walletAddress) {
      onFollow?.(trader);
      return;
    }
    setShowCopySetup(true);
  };

  const handleStartCopying = async () => {
    if (!walletAddress) return;

    setFollowLoading(true);
    try {
      // 1. Create the follow
      const res = await fetch('/api/follows/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, traderId: trader.id }),
      });
      const data = await res.json();

      if (data.success) {
        // 2. Save the amount setting
        await fetch('/api/follows/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress,
            traderId: trader.id,
            auto_trade: true,
            amount_per_trade: copyAmount,
            max_daily_trades: maxDailyTrades,
          }),
        });

        await fetchFollows();
        setShowCopySetup(false);

        const traderName = trader.alias || trader.wallet_address?.slice(0, 10);
        toast(
          'success',
          `Copying ${traderName}`,
          `$${copyAmount} per trade. View signals in Copy Trading.`
        );
      }
    } catch {
      toast('error', 'Copy Failed', 'Something went wrong. Try again.');
    }
    setFollowLoading(false);
  };

  const handleUnfollow = async () => {
    if (!walletAddress) return;

    setFollowLoading(true);
    try {
      const res = await fetch('/api/follows/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, traderId: trader.id }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchFollows();
        setShowAutoSettings(false);
        const traderName = trader.alias || trader.wallet_address?.slice(0, 10);
        toast('info', 'Stopped Copying', `No longer copying ${traderName}.`);
      }
    } catch {
      // Silently fail
    }
    setFollowLoading(false);
  };

  const handleSaveSettings = async () => {
    if (!walletAddress) return;
    setSettingsSaving(true);
    try {
      await fetch('/api/follows/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          traderId: trader.id,
          auto_trade: autoTrade,
          amount_per_trade: copyAmount,
          max_daily_trades: maxDailyTrades,
        }),
      });
      await fetchFollows();
      toast('success', 'Settings Saved', `$${copyAmount}/trade, max ${maxDailyTrades}/day`);
    } catch {
      toast('error', 'Save Failed', 'Could not save settings.');
    }
    setSettingsSaving(false);
  };

  return (
    <motion.div
      className={`ep-card overflow-hidden ${className}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      layout
    >
      {/* Header */}
      <div className="p-3 sm:p-5 pb-0">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Rank + Avatar */}
            <div className="relative">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold"
                style={{
                  background: `${roiColor}15`,
                  color: roiColor,
                  border: `2px solid ${roiColor}30`,
                }}
              >
                {(trader.alias || '?')[0]?.toUpperCase()}
              </div>
              {rank && rank <= 3 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-ep-bg border border-ep-border flex items-center justify-center text-[9px] font-bold text-accent">
                  {rank}
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text-primary">
                  {trader.alias || trader.wallet_address?.slice(0, 10)}
                </span>
                {followed && (
                  <span className="text-[10px] text-accent">★</span>
                )}
                <a
                  href={`https://polymarket.com/profile/${trader.wallet_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-muted hover:text-accent transition-colors"
                  title="View on Polymarket"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <TierBadge tier={trader.bankroll_tier} />
                {trader.trading_style?.toLowerCase() !== trader.bankroll_tier?.toLowerCase() && (
                  <StyleBadge style={trader.trading_style} />
                )}
                {trader.category && <CategoryBadge category={trader.category} />}
              </div>
            </div>
          </div>

          {/* Hero ROI */}
          <div className="text-right">
            <div className="font-mono text-stat-lg" style={{ color: roiColor }}>
              {trader.roi > 0 ? '+' : ''}{trader.roi.toFixed(0)}%
            </div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider">ROI</div>
          </div>
        </div>
      </div>

      {/* ROI Bar */}
      <div className="px-3 sm:px-5 mt-3">
        <div className="gauge-track">
          <motion.div
            className="gauge-fill"
            style={{
              background: `linear-gradient(90deg, ${roiColor}60, ${roiColor})`,
            }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(Math.max(trader.roi, 0), 200) / 2}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-px bg-ep-border/30 mx-3 sm:mx-5 mt-4 rounded-lg overflow-hidden">
        {[
          { label: 'Win Rate', value: `${trader.win_rate?.toFixed(0)}%`, highlight: trader.win_rate > 60 },
          { label: 'PnL', value: formatUsd(trader.total_pnl), highlight: trader.total_pnl > 0 },
          { label: 'Trades', value: trader.trade_count?.toString() || '0' },
          { label: 'Markets', value: trader.markets_traded?.toString() || '0' },
          { label: 'Bankroll', value: formatUsd(trader.estimated_bankroll || 0) },
          { label: 'Rank', value: `${((trader.composite_rank || 0) * 100).toFixed(0)}` },
        ].map((stat) => (
          <div key={stat.label} className="bg-ep-surface/40 p-2 sm:p-3 text-center">
            <div className="text-[10px] text-text-muted uppercase tracking-wider">{stat.label}</div>
            <div className={`font-mono text-xs font-semibold mt-0.5 ${
              stat.highlight ? 'text-profit' : 'text-text-primary'
            }`}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Expandable Trades */}
      <AnimatePresence>
        {expanded && trader.recent_trades && trader.recent_trades.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 py-3 border-t border-ep-border mt-3">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Recent Trades</p>
              <div className="space-y-2">
                {trader.recent_trades.slice(0, 5).map((trade) => (
                  <div key={trade.id} className="flex items-center gap-2 text-xs">
                    <span className={`font-mono font-semibold ${
                      trade.direction === 'YES' ? 'text-profit' : 'text-loss'
                    }`}>
                      {trade.direction === 'YES' ? '▲' : '▼'}
                    </span>
                    <span className="text-text-secondary truncate flex-1">
                      {trade.market?.question || trade.market_id}
                    </span>
                    <span className="font-mono text-text-primary shrink-0">
                      {formatUsd(trade.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Copy Setup Modal (when user clicks Copy) ── */}
      <AnimatePresence>
        {showCopySetup && !followed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setShowCopySetup(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Modal */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-sm bg-ep-card border border-ep-border rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Trader header */}
              <div className="px-5 pt-5 pb-3 border-b border-ep-border/50">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{
                      background: `${roiColor}15`,
                      color: roiColor,
                      border: `2px solid ${roiColor}30`,
                    }}
                  >
                    {(trader.alias || '?')[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      Copy {trader.alias || trader.wallet_address?.slice(0, 10)}
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {trader.win_rate?.toFixed(0)}% win rate · {formatUsd(trader.total_pnl)} PnL
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-text-primary mb-1">
                    How much per trade?
                  </p>
                  <p className="text-[11px] text-text-muted">
                    Each time {trader.alias || 'this trader'} opens a position, we&apos;ll mirror it with this amount.
                  </p>
                </div>

                {/* Amount display + slider */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-2xl font-bold text-accent w-20 text-center">
                      ${copyAmount}
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={250}
                      step={1}
                      value={copyAmount}
                      onChange={(e) => setCopyAmount(Number(e.target.value))}
                      className="flex-1 h-2 rounded-full appearance-none cursor-pointer
                        bg-ep-border/60
                        [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                        [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:bg-accent
                        [&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(0,240,160,0.5)]
                        [&::-webkit-slider-thumb]:cursor-pointer
                        [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5
                        [&::-moz-range-thumb]:rounded-full
                        [&::-moz-range-thumb]:bg-accent
                        [&::-moz-range-thumb]:border-none
                        [&::-moz-range-thumb]:cursor-pointer"
                    />
                  </div>

                  {/* Quick presets */}
                  <div className="flex items-center justify-center gap-2">
                    {AMOUNT_PRESETS.map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setCopyAmount(amt)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
                          copyAmount === amt
                            ? 'bg-accent/15 text-accent border border-accent/30'
                            : 'bg-ep-surface/50 text-text-muted border border-ep-border/50 hover:text-text-secondary'
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Max daily trades */}
                <div className="flex items-center justify-between py-2 border-t border-ep-border/30">
                  <span className="text-xs text-text-secondary">Max daily trades</span>
                  <select
                    value={maxDailyTrades}
                    onChange={(e) => setMaxDailyTrades(Number(e.target.value))}
                    className="px-2 py-1 text-xs bg-ep-surface border border-ep-border rounded-md text-text-primary focus:outline-none focus:border-accent/40"
                  >
                    {[1, 3, 5, 10, 25, 50].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action buttons */}
              <div className="px-5 pb-5 flex gap-2">
                <button
                  onClick={handleStartCopying}
                  disabled={followLoading}
                  className="flex-1 py-3 rounded-xl text-sm font-bold bg-accent text-ep-bg hover:bg-accent/90 disabled:opacity-50 transition flex items-center justify-center gap-2"
                >
                  {followLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Starting...
                    </>
                  ) : (
                    <>Start Copying — ${copyAmount}/trade</>
                  )}
                </button>
                <button
                  onClick={() => setShowCopySetup(false)}
                  className="px-4 py-3 rounded-xl text-sm font-semibold btn-ghost"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Auto-Trade Settings (when already following) ── */}
      <AnimatePresence>
        {followed && showAutoSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-3 sm:px-5 py-3 border-t border-ep-border mt-3 space-y-3">
              <p className="text-[10px] text-text-muted uppercase tracking-wider">Copy Settings</p>

              {/* Auto-trade toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Auto-trade new signals</span>
                <button
                  onClick={() => setAutoTrade(!autoTrade)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    autoTrade ? 'bg-accent' : 'bg-ep-border'
                  }`}
                >
                  <motion.div
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow"
                    animate={{ left: autoTrade ? 18 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>

              {/* Amount per trade */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">Amount per trade</span>
                  <span className="font-mono text-xs font-bold text-accent">${copyAmount}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={250}
                  step={1}
                  value={copyAmount}
                  onChange={(e) => setCopyAmount(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                    bg-ep-border/60
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-accent
                    [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(0,240,160,0.4)]
                    [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                    [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:bg-accent
                    [&::-moz-range-thumb]:border-none
                    [&::-moz-range-thumb]:cursor-pointer"
                />
                <div className="flex items-center justify-center gap-1">
                  {AMOUNT_PRESETS.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setCopyAmount(amt)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition ${
                        copyAmount === amt
                          ? 'bg-accent/15 text-accent border border-accent/30'
                          : 'bg-ep-surface/50 text-text-muted border border-ep-border/50 hover:text-text-secondary'
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max daily trades */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Max daily trades</span>
                <select
                  value={maxDailyTrades}
                  onChange={(e) => setMaxDailyTrades(Number(e.target.value))}
                  className="px-2 py-1 text-xs bg-ep-surface border border-ep-border rounded-md text-text-primary focus:outline-none focus:border-accent/40"
                >
                  {[1, 3, 5, 10, 25, 50].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              {/* Save button */}
              <button
                onClick={handleSaveSettings}
                disabled={settingsSaving}
                className="w-full py-1.5 rounded-lg text-xs font-semibold bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 disabled:opacity-50 transition"
              >
                {settingsSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex gap-2 p-3 sm:p-5 pt-4">
        {followed ? (
          <>
            {/* Copying indicator with amount */}
            <button
              onClick={handleUnfollow}
              disabled={followLoading}
              className="flex-1 py-2 rounded-lg text-xs font-semibold bg-profit/10 text-profit border border-profit/20 hover:bg-loss/10 hover:text-loss hover:border-loss/20 disabled:opacity-50 transition flex items-center justify-center gap-1.5 group"
            >
              {followLoading ? (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <>
                  <span className="group-hover:hidden">
                    Copying ${followRecord?.amountPerTrade || copyAmount}/trade ★
                  </span>
                  <span className="hidden group-hover:inline">
                    Stop Copying
                  </span>
                </>
              )}
            </button>
            <button
              onClick={() => setShowAutoSettings(!showAutoSettings)}
              className={`px-3 py-2 rounded-lg text-xs shrink-0 transition ${
                showAutoSettings
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'btn-ghost'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </>
        ) : (
          <button
            onClick={handleCopyClick}
            disabled={followLoading}
            className="flex-1 py-2 rounded-lg text-xs font-semibold btn-accent disabled:opacity-50 transition"
          >
            {followLoading ? 'Copying...' : 'Copy'}
          </button>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="btn-ghost px-3 py-1.5 text-xs shrink-0"
        >
          {expanded ? '▴' : '▾'} Trades
        </button>
      </div>
    </motion.div>
  );
}
