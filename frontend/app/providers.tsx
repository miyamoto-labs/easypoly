'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { addRpcUrlOverrideToChain } from '@privy-io/react-auth';
import { polygon } from 'viem/chains';
import { PrivyWalletProvider } from '@/app/lib/contexts/PrivyWalletContext';
import { usePrivyStoreBridge } from '@/app/lib/hooks/usePrivyStoreBridge';

/* ── Constants ─────────────────────────────────── */
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';
const POLYGON_RPC = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com';

/* ── Error Boundary ────────────────────────────── */
class ProviderErrorBoundary extends Component<
  { children: ReactNode; name: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; name: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}] Error:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      console.error(`[${this.props.name}] Caught:`, this.state.error?.message);
      return <>{this.props.children}</>;
    }
    return this.props.children;
  }
}

/* ── Bridge: syncs Privy auth → Zustand user store ── */
function PrivyStoreBridge({ children }: { children: ReactNode }) {
  usePrivyStoreBridge();
  return <>{children}</>;
}

/* ── Polygon chain with custom RPC ────────────── */
const polygonWithRpc = (() => {
  try {
    return addRpcUrlOverrideToChain(polygon, POLYGON_RPC);
  } catch {
    return polygon;
  }
})();

/* ── Provider (always wraps children — no SSR guard needed) ── */
/* SSR safety is handled in layout.tsx via next/dynamic ssr:false */
export function Providers({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) {
    return <>{children}</>;
  }

  return (
    <ProviderErrorBoundary name="PrivyProvider">
      <PrivyProvider
        appId={PRIVY_APP_ID}
        config={{
          defaultChain: polygon,
          supportedChains: [polygonWithRpc],
          appearance: {
            theme: 'dark',
            accentColor: '#00F0A0',
            logo: '/easyp.jpg',
          },
          loginMethods: ['google', 'twitter', 'wallet'],
          embeddedWallets: {
            ethereum: {
              createOnLogin: 'users-without-wallets',
            },
            showWalletUIs: false,
          },
        }}
      >
        <ProviderErrorBoundary name="PrivyWalletProvider">
          <PrivyWalletProvider>
            <PrivyStoreBridge>
              {children}
            </PrivyStoreBridge>
          </PrivyWalletProvider>
        </ProviderErrorBoundary>
      </PrivyProvider>
    </ProviderErrorBoundary>
  );
}
