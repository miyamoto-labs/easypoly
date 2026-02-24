'use client';

import { useState, useCallback } from 'react';
import { usePrivyWallet } from '@/app/lib/contexts/PrivyWalletContext';
import { useTradingSession } from './useTradingSession';
import { useUsdcBalance } from './useUsdcBalance';
import { BrowserBuilderConfig } from '@/app/lib/browser-builder-config';
import { isAddress, encodeFunctionData, parseUnits } from 'viem';

/* ── Constants ─────────────────────────────────── */
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as const; // USDC.e on Polygon
const RELAYER_URL = 'https://relayer-v2.polymarket.com/';

// Minimal ERC-20 transfer ABI
const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/* ── Hook ──────────────────────────────────────── */
export type WithdrawStatus = 'idle' | 'confirming' | 'sending' | 'polling' | 'success' | 'error';

export function useWithdraw() {
  const { walletClient } = usePrivyWallet();
  const { session } = useTradingSession();
  const { balance, refetch: refetchBalance } = useUsdcBalance();

  const [status, setStatus] = useState<WithdrawStatus>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const withdraw = useCallback(
    async (toAddress: string, amount: number) => {
      setError(null);
      setTxHash(null);

      // Validate inputs
      if (!isAddress(toAddress)) {
        setError('Invalid destination address');
        setStatus('error');
        return false;
      }

      if (amount <= 0) {
        setError('Amount must be greater than 0');
        setStatus('error');
        return false;
      }

      if (balance !== null && amount > balance) {
        setError(`Insufficient balance. You have $${balance.toFixed(2)}`);
        setStatus('error');
        return false;
      }

      if (!walletClient || !session?.safeAddress) {
        setError('Wallet not connected or trading session not initialized');
        setStatus('error');
        return false;
      }

      try {
        setStatus('sending');

        // Import SDK modules
        const { RelayClient } = await import('@polymarket/builder-relayer-client');

        const builderConfig = new BrowserBuilderConfig();

        const relayClient = new RelayClient(
          RELAYER_URL,
          137,
          walletClient as any,
          builderConfig
        );

        // Encode the ERC-20 transfer call
        const usdcAmount = parseUnits(amount.toString(), 6); // USDC has 6 decimals
        const calldata = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [toAddress as `0x${string}`, usdcAmount],
        });

        // Execute via the Polymarket Relayer (executes as the Safe)
        const txResponse = await relayClient.execute(
          [{ to: USDC_ADDRESS, data: calldata, value: '0' }],
        );

        setStatus('polling');

        // Poll for on-chain confirmation (up to ~60s: 20 polls × 3s each)
        // Must match the state constants used by the Polymarket relayer
        const result = await relayClient.pollUntilState(
          txResponse.transactionID,
          ['STATE_MINED', 'STATE_CONFIRMED'],
          'STATE_FAILED',
          20,
          3000
        );

        if (!result) {
          throw new Error('Transaction confirmation timed out — check Polygonscan for status');
        }

        if ((result as any).state === 'STATE_FAILED') {
          throw new Error('Withdrawal transaction failed on-chain');
        }

        setTxHash((result as any).transactionHash || txResponse.transactionID);
        setStatus('success');
        refetchBalance();
        return true;
      } catch (err: any) {
        console.error('[useWithdraw] Error:', err);
        setError(err?.message || 'Withdrawal failed');
        setStatus('error');
        return false;
      }
    },
    [walletClient, session, balance, refetchBalance]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setTxHash(null);
  }, []);

  return {
    withdraw,
    reset,
    status,
    txHash,
    error,
    balance,
    safeAddress: session?.safeAddress,
  };
}
