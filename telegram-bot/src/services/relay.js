import { ethers } from 'ethers';
import { createWalletClient, http } from 'viem';
import { polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { RelayClient, RelayerTxType } from '@polymarket/builder-relayer-client';
import { BuilderConfig } from '@polymarket/builder-signing-sdk';
import { encodeFunctionData, parseUnits, formatUnits } from 'viem';
import dotenv from 'dotenv';

dotenv.config();

// USDC contract address on Polygon
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e on Polygon

// Polygon RPC
const POLYGON_RPC = process.env.POLYGON_RPC || 'https://polygon-rpc.com';

// Builder credentials
const BUILDER_API_KEY = process.env.POLY_BUILDER_API_KEY;
const BUILDER_SECRET = process.env.POLY_BUILDER_SECRET;
const BUILDER_PASSPHRASE = process.env.POLY_BUILDER_PASSPHRASE;

// ERC20 ABI for transfer
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }]
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }]
  },
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }]
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ type: 'uint256' }]
  }
];

const CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

// Max uint256 for unlimited approval
const MAX_UINT256 = BigInt(2 ** 256 - 1);

/**
 * Get the relay client instance
 */
function getRelayClient(privateKey) {
  // Create viem account from private key
  const account = privateKeyToAccount(privateKey);
  
  // Create wallet client
  const wallet = createWalletClient({
    account,
    chain: polygon,
    transport: http(POLYGON_RPC),
  });

  // Create builder config
  const builderConfig = new BuilderConfig({
    localBuilderCreds: {
      key: BUILDER_API_KEY,
      secret: BUILDER_SECRET,
      passphrase: BUILDER_PASSPHRASE,
    },
  });

  // Create relay client for SAFE wallet type
  const relayClient = new RelayClient(
    'https://relayer-v2.polymarket.com/',
    137, // Polygon chain ID
    wallet,
    builderConfig,
    RelayerTxType.SAFE
  );

  return relayClient;
}

/**
 * Execute gas-free USDC withdrawal via relayer
 * @param {string} privateKey - User's private key
 * @param {string} toAddress - Recipient address
 * @param {number} amount - Amount in USDC (e.g., 50 for $50)
 * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
 */
export async function executeWithdrawalGasFree(privateKey, toAddress, amount) {
  try {
    console.log(`[Relay Withdrawal] Initiating: $${amount} USDC to ${toAddress} (GAS-FREE)`);
    
    const relayClient = getRelayClient(privateKey);
    
    // Get account address
    const account = privateKeyToAccount(privateKey);
    const fromAddress = account.address;
    
    // USDC has 6 decimals on Polygon
    const amountWei = parseUnits(amount.toString(), 6);
    
    // Encode the transfer function call
    const transferData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [toAddress, amountWei],
    });
    
    // Create the transaction
    const transferTx = {
      to: USDC_ADDRESS,
      data: transferData,
      value: '0',
    };
    
    console.log(`[Relay Withdrawal] Submitting via relayer...`);
    
    // Execute through relayer (gas-free!)
    const response = await relayClient.execute([transferTx], 'USDC Withdrawal');
    
    console.log(`[Relay Withdrawal] Transaction submitted, waiting for confirmation...`);
    
    // Wait for confirmation
    const result = await response.wait();
    
    if (result && result.transactionHash) {
      console.log(`[Relay Withdrawal] Confirmed: ${result.transactionHash}`);
      return {
        success: true,
        txHash: result.transactionHash,
        blockNumber: result.blockNumber,
        gasFree: true
      };
    } else {
      console.error(`[Relay Withdrawal] Transaction failed`);
      return {
        success: false,
        error: 'Transaction failed on blockchain'
      };
    }
    
  } catch (error) {
    console.error('[Relay Withdrawal] Error:', error);
    
    let errorMessage = 'Transaction failed';
    if (error.message) {
      errorMessage = error.message.substring(0, 150);
    }
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Approve USDC for trading (gas-free via relayer)
 * @param {string} privateKey - User's private key
 * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
 */
export async function approveUsdcGasFree(privateKey) {
  try {
    console.log(`[Relay Approval] Approving USDC for CTF (GAS-FREE)`);
    
    const relayClient = getRelayClient(privateKey);
    
    // Encode the approve function call (unlimited approval)
    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CTF_ADDRESS, MAX_UINT256],
    });
    
    // Create the transaction
    const approveTx = {
      to: USDC_ADDRESS,
      data: approveData,
      value: '0',
    };
    
    console.log(`[Relay Approval] Submitting via relayer...`);
    
    // Execute through relayer (gas-free!)
    const response = await relayClient.execute([approveTx], 'Approve USDC');
    
    console.log(`[Relay Approval] Transaction submitted, waiting for confirmation...`);
    
    // Wait for confirmation
    const result = await response.wait();
    
    if (result && result.transactionHash) {
      console.log(`[Relay Approval] Confirmed: ${result.transactionHash}`);
      return {
        success: true,
        txHash: result.transactionHash,
        gasFree: true
      };
    } else {
      console.error(`[Relay Approval] Transaction failed`);
      return {
        success: false,
        error: 'Approval failed'
      };
    }
    
  } catch (error) {
    console.error('[Relay Approval] Error:', error);
    
    let errorMessage = 'Approval failed';
    if (error.message) {
      errorMessage = error.message.substring(0, 150);
    }
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Check USDC balance (using standard provider)
 * @param {string} address - Wallet address
 * @returns {Promise<string>} Balance in USDC
 */
export async function getUsdcBalance(address) {
  try {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
    
    const balance = await usdcContract.balanceOf(address);
    return formatUnits(balance, 6);
  } catch (error) {
    console.error('Error fetching USDC balance:', error);
    return '0';
  }
}

/**
 * Check if USDC is approved for CTF
 * @param {string} privateKey - User's private key
 * @returns {Promise<boolean>}
 */
export async function isUsdcApproved(privateKey) {
  try {
    const account = privateKeyToAccount(privateKey);
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
    
    const allowance = await usdcContract.allowance(account.address, CTF_ADDRESS);
    return allowance > 0;
  } catch (error) {
    console.error('Error checking approval:', error);
    return false;
  }
}

/**
 * Get wallet address from private key
 * @param {string} privateKey - Private key
 * @returns {string} Address
 */
export function getWalletAddress(privateKey) {
  const account = privateKeyToAccount(privateKey);
  return account.address;
}
