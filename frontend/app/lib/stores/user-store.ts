'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/* ── Follow record ─────────────────────────────── */
export interface FollowRecord {
  traderId: string;
  autoTrade: boolean;
  amountPerTrade: number;
  maxDailyTrades: number;
}

/* ── Standing order record (cached) ───────────── */
export interface StandingOrderRecord {
  id: string;
  minConviction: number;
  maxConviction: number;
  directionFilter: string | null;
  amount: number;
  dailyLimit: number;
  active: boolean;
  label: string | null;
  todayExecutions: number;
}

/* ── Subscription types ────────────────────────── */
export type SubscriptionTier = 'free' | 'pro' | 'whale';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';

/* ── State interface ───────────────────────────── */
interface UserState {
  walletAddress: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  hasCredentials: boolean;
  hasAutoTrading: boolean;

  // Subscription
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  isPro: boolean;

  // Quick Trade preferences
  quickTradeEnabled: boolean;
  customPresets: number[];

  // Follows
  followedTraderIds: string[];
  follows: FollowRecord[];

  // Standing Orders (cached summary)
  standingOrderCount: number;

  // Onboarding
  hasCompletedOnboarding: boolean;
  hasSeenArcadeTour: boolean;

  // ── Actions ─────────────────────────────────
  setConnecting: (connecting: boolean) => void;
  setConnected: (address: string, hasCreds: boolean) => void;
  disconnect: () => void;

  // Subscription
  setSubscription: (tier: SubscriptionTier, status: SubscriptionStatus) => void;
  fetchSubscription: () => Promise<void>;

  // Quick trade
  setQuickTradeEnabled: (enabled: boolean) => void;
  setCustomPresets: (presets: number[]) => void;

  // Follows
  setFollows: (follows: FollowRecord[]) => void;
  isFollowing: (traderId: string) => boolean;
  fetchFollows: () => Promise<void>;

  // Standing Orders
  fetchStandingOrderCount: () => Promise<void>;

  // Onboarding
  setOnboardingComplete: () => void;
  setArcadeTourSeen: () => void;

  /** Re-check stored wallet on page load */
  hydrate: () => Promise<void>;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      walletAddress: null,
      isConnected: false,
      isConnecting: false,
      hasCredentials: false,
      hasAutoTrading: false,

      // Subscription defaults
      subscriptionTier: 'free' as SubscriptionTier,
      subscriptionStatus: 'none' as SubscriptionStatus,
      isPro: true, // Free during beta — everyone gets full access

      // Quick Trade defaults
      quickTradeEnabled: false,
      customPresets: [5, 10, 25, 50, 100],

      // Follows defaults
      followedTraderIds: [],
      follows: [],

      // Standing Orders
      standingOrderCount: 0,

      // Onboarding
      hasCompletedOnboarding: false,
      hasSeenArcadeTour: false,

      /* ── Wallet actions ─────────────────────── */
      setConnecting: (connecting) => set({ isConnecting: connecting }),

      setConnected: (address, hasCreds) =>
        set({
          walletAddress: address.toLowerCase(),
          isConnected: true,
          isConnecting: false,
          hasCredentials: hasCreds,
        }),

      disconnect: () =>
        set({
          walletAddress: null,
          isConnected: false,
          isConnecting: false,
          hasCredentials: false,
          hasAutoTrading: false,
          subscriptionTier: 'free' as SubscriptionTier,
          subscriptionStatus: 'none' as SubscriptionStatus,
          isPro: true, // Free during beta
        }),

      /* ── Subscription actions ────────────────── */
      setSubscription: (tier, status) =>
        set({
          subscriptionTier: tier,
          subscriptionStatus: status,
          isPro: true, // Free during beta
        }),

      fetchSubscription: async () => {
        const { walletAddress } = get();
        if (!walletAddress) return;

        try {
          const res = await fetch(`/api/subscription/status?wallet=${walletAddress}`);
          if (res.ok) {
            const data = await res.json();
            const tier = (data.tier || 'free') as SubscriptionTier;
            const status = (data.status || 'none') as SubscriptionStatus;
            set({
              subscriptionTier: tier,
              subscriptionStatus: status,
              isPro: true, // Free during beta
            });
          }
        } catch {
          // Network error — keep cached state
        }
      },

      /* ── Quick trade actions ────────────────── */
      setQuickTradeEnabled: (enabled) => set({ quickTradeEnabled: enabled }),

      setCustomPresets: (presets) => set({ customPresets: presets }),

      /* ── Onboarding actions ──────────────────── */
      setOnboardingComplete: () => set({ hasCompletedOnboarding: true }),
      setArcadeTourSeen: () => set({ hasSeenArcadeTour: true }),

      /* ── Follow actions ─────────────────────── */
      setFollows: (follows) =>
        set({
          follows,
          followedTraderIds: follows.map((f) => f.traderId),
        }),

      isFollowing: (traderId) => get().followedTraderIds.includes(traderId),

      fetchFollows: async () => {
        const { walletAddress } = get();
        if (!walletAddress) return;

        try {
          const res = await fetch(`/api/follows/list?walletAddress=${walletAddress}`);
          if (res.ok) {
            const data = await res.json();
            const records: FollowRecord[] = (data.follows || []).map((f: any) => ({
              traderId: f.trader_id,
              autoTrade: f.auto_trade,
              amountPerTrade: f.amount_per_trade,
              maxDailyTrades: f.max_daily_trades,
            }));
            set({
              follows: records,
              followedTraderIds: records.map((r) => r.traderId),
            });
          }
        } catch {
          // Network error — keep cached state
        }
      },

      /* ── Standing Order actions ───────────────── */
      fetchStandingOrderCount: async () => {
        const { walletAddress, isPro } = get();
        if (!walletAddress) return;

        try {
          const res = await fetch(`/api/standing-orders?wallet=${walletAddress}`);
          if (res.ok) {
            const data = await res.json();
            set({ standingOrderCount: (data.orders || []).length });
          }
        } catch {
          // Network error — keep cached state
        }
      },

      /* ── Hydrate ────────────────────────────── */
      hydrate: async () => {
        const { walletAddress, hasCompletedOnboarding } = get();
        if (!walletAddress) return;

        // Migration: existing users who connected before onboarding was added
        // skip the wizard if they already have credentials stored
        if (!hasCompletedOnboarding && get().hasCredentials) {
          set({ hasCompletedOnboarding: true });
        }

        // Verify wallet is still available in browser
        // For Privy users: no window.ethereum check needed — Privy manages auth
        if (typeof window !== 'undefined' && window.ethereum) {
          try {
            const accounts: string[] = await window.ethereum.request({
              method: 'eth_accounts',
            });
            const connected = accounts.some(
              (a: string) => a.toLowerCase() === walletAddress.toLowerCase()
            );
            if (!connected) {
              // Don't disconnect Privy users (they have a trading session, not MetaMask)
              const hasPrivySession = Array.from(
                { length: localStorage.length },
                (_, i) => localStorage.key(i)
              ).some((k) => k?.startsWith('ep_trading_session_'));
              if (!hasPrivySession) {
                set({ isConnected: false, isConnecting: false });
                return;
              }
            }
          } catch {
            // If ethereum check fails, don't disconnect — could be Privy user
          }
        }

        // Check server-side credential status
        try {
          const res = await fetch(`/api/wallet/status?address=${walletAddress}`);
          if (res.ok) {
            const data = await res.json();
            set({ hasCredentials: data.hasCredentials, hasAutoTrading: !!data.hasAutoTrading, isConnected: true });
          }
        } catch {
          // Network error — keep local state
        }

        // Fetch subscription + follows + standing orders if connected
        get().fetchSubscription();
        get().fetchFollows();
        get().fetchStandingOrderCount();
      },
    }),
    {
      name: 'ep-user',
      partialize: (state) => ({
        walletAddress: state.walletAddress,
        hasCredentials: state.hasCredentials,
        subscriptionTier: state.subscriptionTier,
        subscriptionStatus: state.subscriptionStatus,
        isPro: state.isPro,
        quickTradeEnabled: state.quickTradeEnabled,
        customPresets: state.customPresets,
        followedTraderIds: state.followedTraderIds,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        hasSeenArcadeTour: state.hasSeenArcadeTour,
      }),
    }
  )
);
