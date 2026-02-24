'use client';

import { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { usePrivyWallet } from '@/app/lib/contexts/PrivyWalletContext';
import { useTradingSession } from '@/app/lib/hooks/useTradingSession';
import { useUserStore } from '@/app/lib/stores/user-store';

/**
 * Bridges Privy authentication state into the existing Zustand user store.
 *
 * This keeps `useUserStore().isConnected`, `.walletAddress`, `.hasCredentials`
 * in sync with Privy + TradingSession state, so all existing components
 * that read from the store continue to work without modification.
 *
 * Mount this once inside the Providers tree (after PrivyProvider).
 */
export function usePrivyStoreBridge() {
  const { authenticated, ready } = usePrivy();
  const { eoaAddress } = usePrivyWallet();
  const { session, isComplete, safeAddress } = useTradingSession();
  const { setConnected, disconnect, walletAddress, isConnected, hasCredentials } = useUserStore();

  useEffect(() => {
    if (!ready) return;

    if (authenticated && isComplete && safeAddress) {
      // Privy user with complete trading session
      // Use Safe address as the "wallet" (that's where USDC lives)
      // Must always reconcile — isConnected is NOT persisted so it defaults
      // to false after page refresh even when walletAddress already matches.
      const addr = safeAddress.toLowerCase();
      if (walletAddress !== addr || !isConnected || !hasCredentials) {
        setConnected(addr, true);
      }
    } else if (authenticated && eoaAddress && !isComplete) {
      // Privy user still setting up — show as connected but no creds yet
      const addr = (safeAddress || eoaAddress).toLowerCase();
      if (walletAddress !== addr || !isConnected) {
        setConnected(addr, false);
      }
    } else if (!authenticated && ready) {
      // Logged out of Privy — disconnect the store
      if (walletAddress || isConnected) {
        disconnect();
      }
    }
  }, [authenticated, ready, eoaAddress, isComplete, safeAddress, walletAddress, isConnected, hasCredentials, setConnected, disconnect]);
}
