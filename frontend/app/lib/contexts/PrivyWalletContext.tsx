'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom, type WalletClient, createPublicClient, http, type PublicClient } from 'viem';
import { polygon } from 'viem/chains';

/* ── Types ─────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CompatSigner = any;

/**
 * Builds the EIP-712 typed data payload for eth_signTypedData_v4.
 * Handles BigInt serialization and constructs the EIP712Domain type array
 * from the domain object (matching ethers v5 _signTypedData behavior).
 */
function buildTypedDataPayload(domain: any, types: any, value: any) {
  // Build EIP712Domain type from the domain fields present
  const domainTypes: { name: string; type: string }[] = [];
  if (domain.name !== undefined) domainTypes.push({ name: 'name', type: 'string' });
  if (domain.version !== undefined) domainTypes.push({ name: 'version', type: 'string' });
  if (domain.chainId !== undefined) domainTypes.push({ name: 'chainId', type: 'uint256' });
  if (domain.verifyingContract !== undefined) domainTypes.push({ name: 'verifyingContract', type: 'address' });
  if (domain.salt !== undefined) domainTypes.push({ name: 'salt', type: 'bytes32' });

  // Serialize domain — convert BigInt/number chainId to string for JSON
  const serializedDomain = { ...domain };
  if (serializedDomain.chainId !== undefined) {
    serializedDomain.chainId = Number(serializedDomain.chainId);
  }

  // Serialize message values — convert BigInt to string, numbers to string for uint256
  const serializedValue: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'bigint') {
      serializedValue[k] = v.toString();
    } else if (typeof v === 'number') {
      serializedValue[k] = v;
    } else {
      serializedValue[k] = v;
    }
  }

  return {
    types: { EIP712Domain: domainTypes, ...types },
    primaryType: Object.keys(types)[0],
    domain: serializedDomain,
    message: serializedValue,
  };
}

/**
 * Creates a lightweight signer object that the Polymarket ClobClient can use.
 * Uses raw EIP-1193 provider calls instead of ethers (avoids v5/v6 compat issues).
 *
 * The ClobClient SDK needs:
 *   - getAddress() → string
 *   - _signTypedData(domain, types, value) → signature string
 */
function makeEip1193Signer(address: string, provider: any): CompatSigner {
  const signTypedDataFn = async (domain: any, types: any, value: any) => {
    const typedData = buildTypedDataPayload(domain, types, value);
    console.log('[Signer] signTypedData called for', typedData.primaryType);

    const sig = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [address, JSON.stringify(typedData)],
    });

    console.log('[Signer] Signature received:', sig?.substring(0, 20) + '...');
    return sig;
  };

  return {
    getAddress: async () => address,
    _signTypedData: signTypedDataFn,
    signTypedData: signTypedDataFn,
    provider,
  };
}

interface PrivyWalletContextType {
  /** The embedded EOA wallet address */
  eoaAddress: `0x${string}` | undefined;
  /** viem WalletClient for general wallet ops */
  walletClient: WalletClient | null;
  /** viem PublicClient for on-chain reads */
  publicClient: PublicClient | null;
  /** ethers signer (v6 with v5 compat shim) — used by ClobClient / RelayClient */
  ethersSigner: CompatSigner | null;
  /** Wallet provisioned + chain correct + authenticated */
  isReady: boolean;
  /** User is authenticated via Privy */
  authenticated: boolean;
}

const PrivyWalletContext = createContext<PrivyWalletContextType>({
  eoaAddress: undefined,
  walletClient: null,
  publicClient: null,
  ethersSigner: null,
  isReady: false,
  authenticated: false,
});

export const usePrivyWallet = () => useContext(PrivyWalletContext);

/* ── Constants ─────────────────────────────────── */
const POLYGON_RPC = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com';

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(POLYGON_RPC),
});

/* ── Provider ──────────────────────────────────── */
export function PrivyWalletProvider({ children }: { children: ReactNode }) {
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [ethersSigner, setEthersSigner] = useState<CompatSigner | null>(null);

  const { wallets, ready } = useWallets();
  const { authenticated, user } = usePrivy();

  // Find the embedded wallet (Privy-provisioned)
  const wallet = wallets.find((w) => w.address === user?.wallet?.address);
  const eoaAddress = authenticated && wallet ? (wallet.address as `0x${string}`) : undefined;

  // Initialize wallet clients when wallet is available
  useEffect(() => {
    async function init() {
      if (!wallet || !ready) {
        setWalletClient(null);
        setEthersSigner(null);
        return;
      }

      try {
        const provider = await wallet.getEthereumProvider();

        // viem WalletClient
        const client = createWalletClient({
          account: eoaAddress!,
          chain: polygon,
          transport: custom(provider),
        });
        setWalletClient(client);

        // Lightweight signer for Polymarket ClobClient
        // Uses raw EIP-1193 provider calls instead of ethers (avoids v5/v6 compat issues)
        const signer = makeEip1193Signer(eoaAddress!, provider);
        setEthersSigner(signer);
      } catch (err) {
        console.error('Failed to initialize Privy wallet client:', err);
        setWalletClient(null);
        setEthersSigner(null);
      }
    }
    init();
  }, [wallet, ready, eoaAddress]);

  // Auto-switch to Polygon if on wrong chain
  useEffect(() => {
    async function ensurePolygon() {
      if (!wallet || !ready || !authenticated) return;
      try {
        const chainId = wallet.chainId;
        if (chainId !== `eip155:${polygon.id}`) {
          await wallet.switchChain(polygon.id);
        }
      } catch (err) {
        console.error('Failed to switch to Polygon:', err);
      }
    }
    ensurePolygon();
  }, [wallet, ready, authenticated]);

  return (
    <PrivyWalletContext.Provider
      value={{
        eoaAddress,
        walletClient,
        publicClient,
        ethersSigner,
        isReady: ready && authenticated && !!walletClient && !!ethersSigner,
        authenticated,
      }}
    >
      {children}
    </PrivyWalletContext.Provider>
  );
}
