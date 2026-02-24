'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivyClobClient } from '@/app/lib/hooks/usePrivyClobClient';
import { useToast } from './Toast';

export interface SellPosition {
  id: string;
  question: string;
  outcome: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  livePrice?: number | null;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  assetId: string;
  sellDisabled?: boolean;
  sellDisabledReason?: string;
}

interface SellPositionModalProps {
  position: SellPosition | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function SellPositionModal({ position, onClose, onSuccess }: SellPositionModalProps) {
  const [selling, setSelling] = useState(false);
  const { sellPosition, isReady } = usePrivyClobClient();
  const { toast } = useToast();

  if (!position) return null;

  // Use live price when available, fall back to curPrice.
  // Apply a 2% discount to increase fill probability on the CLOB —
  // Gamma returns mid-market price, but sells need to hit the best bid.
  const rawPrice = position.livePrice ?? position.curPrice;
  const hasLivePrice = position.livePrice != null && position.livePrice > 0;
  const effectivePrice = Math.max(
    Math.round(rawPrice * 98) / 100, // 2% discount for better fills
    0.01,
  );
  const estimatedProceeds = position.size * effectivePrice;
  const isProfit = position.pnl >= 0;

  const handleSell = async () => {
    if (!sellPosition || !isReady) {
      toast('error', 'Not Ready', 'Trading session not initialized. Try logging in again.');
      return;
    }

    if (!position.assetId) {
      toast('error', 'Missing Data', 'Cannot sell — token ID not available for this position.');
      return;
    }

    if (effectivePrice <= 0) {
      toast('error', 'No Price', 'Cannot sell — market price is unavailable. Try again in a moment.');
      return;
    }

    setSelling(true);
    try {
      await sellPosition({
        tokenID: position.assetId,
        size: position.size,
        price: effectivePrice,
      });

      toast('success',
        'Position Closed',
        `Sold ${position.size.toFixed(1)} ${position.outcome} shares for ~$${estimatedProceeds.toFixed(2)}`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Sell failed:', err);
      toast('error',
        'Sell Failed',
        err?.message || 'Could not close position. The order may not have been filled.'
      );
    } finally {
      setSelling(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="ep-card rounded-2xl p-6 max-w-sm w-full border border-ep-border shadow-card"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <h3 className="font-display text-lg font-bold text-text-primary">
              Close Position
            </h3>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Market question */}
          <p className="text-sm text-text-secondary leading-snug mb-4">
            {position.question}
          </p>

          {/* Position details */}
          <div className="space-y-2 mb-5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Outcome</span>
              <span className={`font-bold px-2 py-0.5 rounded ${
                position.outcome.toUpperCase() === 'YES'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {position.outcome.toUpperCase()}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Shares</span>
              <span className="font-mono text-text-primary">{position.size.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Entry Price</span>
              <span className="font-mono text-text-secondary">{(position.avgPrice * 100).toFixed(1)}¢</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Current Price</span>
              <span className="font-mono text-text-primary flex items-center gap-1.5">
                {(effectivePrice * 100).toFixed(1)}¢
                {hasLivePrice && (
                  <span className="h-1.5 w-1.5 rounded-full bg-profit animate-pulse" title="Live price" />
                )}
              </span>
            </div>

            <div className="border-t border-ep-border my-2" />

            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Est. Proceeds</span>
              <span className="font-mono font-bold text-text-primary">
                ${estimatedProceeds.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">P&L</span>
              <span className={`font-mono font-bold ${isProfit ? 'text-profit' : 'text-loss'}`}>
                {isProfit ? '+' : ''}${position.pnl.toFixed(2)} ({isProfit ? '+' : ''}{position.pnlPercent.toFixed(1)}%)
              </span>
            </div>
          </div>

          {/* Price warning */}
          {effectivePrice <= 0 && (
            <div className="mb-4 p-2.5 rounded-lg bg-yellow-500/[0.08] border border-yellow-500/20 text-xs text-yellow-400">
              Price unavailable — cannot execute sell order right now.
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-text-secondary bg-ep-surface border border-ep-border hover:border-ep-border/80 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSell}
              disabled={selling || !isReady || effectivePrice <= 0 || !position.assetId}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-loss hover:bg-loss/90 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {selling ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Selling...
                </>
              ) : (
                <>Sell All</>
              )}
            </button>
          </div>

          {!isReady && (
            <p className="text-[10px] text-yellow-400 text-center mt-3">
              Trading session not ready — log in to enable selling
            </p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
