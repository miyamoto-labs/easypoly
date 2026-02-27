import { PrivyClient } from '@privy-io/server-auth';
import dotenv from 'dotenv';
import { getWalletBalances } from './blockchain.js';

dotenv.config();

const privyAppId = process.env.PRIVY_APP_ID;
const privyAppSecret = process.env.PRIVY_APP_SECRET;

if (!privyAppId || !privyAppSecret) {
  console.warn('Warning: Privy credentials not configured');
}

// Initialize Privy client
const privy = privyAppId && privyAppSecret 
  ? new PrivyClient(privyAppId, privyAppSecret)
  : null;

/**
 * Create or get embedded wallet for user
 * 
 * Note: Currently using simplified wallet generation
 * Full Privy embedded wallet integration requires frontend SDK
 */
export async function createUserWallet(telegramId) {
  try {
    // Generate a deterministic wallet address from telegram ID
    // In production, this would use Privy's embedded wallet SDK
    // For now, creating a placeholder that we'll upgrade
    
    const ethers = await import('ethers');
    const wallet = ethers.Wallet.createRandom();
    
    return {
      privyUserId: `telegram:${telegramId}`,
      walletAddress: wallet.address,
      privateKey: wallet.privateKey, // Store encrypted in production!
      wallet
    };
  } catch (error) {
    console.error('Error creating wallet:', error);
    throw new Error('Failed to create wallet. Please try again.');
  }
}

/**
 * Get user's wallet info
 */
export async function getUserWallet(privyUserId) {
  if (!privy) {
    throw new Error('Privy not configured');
  }

  try {
    const user = await privy.getUser(privyUserId);
    const wallet = user.linkedAccounts.find(account => account.type === 'wallet');
    
    return wallet;
  } catch (error) {
    console.error('Error getting Privy wallet:', error);
    throw error;
  }
}

/**
 * Get wallet balance (USDC on Polygon)
 */
export async function getWalletBalance(walletAddress) {
  try {
    const ethers = await import('ethers');
    
    console.log('🔍 Checking balance for:', walletAddress);
    
    // Polygon mainnet RPC (PublicNode - reliable and free)
    const provider = new ethers.JsonRpcProvider('https://polygon-bor-rpc.publicnode.com');
    
    const ERC20_ABI = [
      'function balanceOf(address owner) view returns (uint256)'
    ];
    
    // Check both USDC contracts on Polygon
    const USDC_NATIVE = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // Native USDC
    const USDC_BRIDGED = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // Bridged USDC.e
    
    // Check native USDC
    const nativeContract = new ethers.Contract(USDC_NATIVE, ERC20_ABI, provider);
    const nativeBalance = await nativeContract.balanceOf(walletAddress);
    console.log('Native USDC balance:', ethers.formatUnits(nativeBalance, 6));
    
    // Check bridged USDC
    const bridgedContract = new ethers.Contract(USDC_BRIDGED, ERC20_ABI, provider);
    const bridgedBalance = await bridgedContract.balanceOf(walletAddress);
    console.log('Bridged USDC balance:', ethers.formatUnits(bridgedBalance, 6));
    
    // Return total (both have 6 decimals)
    const total = parseFloat(ethers.formatUnits(nativeBalance, 6)) + 
                  parseFloat(ethers.formatUnits(bridgedBalance, 6));
    
    console.log('✅ Total USDC balance:', total);
    return total;
  } catch (error) {
    console.error('❌ Error getting wallet balance:', error);
    return 0;
  }
}

/**
 * Generate deposit address for user
 */
export function getDepositAddress(walletAddress) {
  return walletAddress;
}

/**
 * Initiate withdrawal
 */
export async function initiateWithdrawal(privyUserId, toAddress, amount) {
  if (!privy) {
    throw new Error('Privy not configured');
  }

  try {
    // Note: Actual withdrawal implementation depends on your architecture
    // You may need to use Privy's transaction API or ethers.js
    
    // Placeholder response
    return {
      success: false,
      message: 'Withdrawal functionality not yet implemented'
    };
  } catch (error) {
    console.error('Error initiating withdrawal:', error);
    throw error;
  }
}

export default {
  createUserWallet,
  getUserWallet,
  getWalletBalance,
  getDepositAddress,
  initiateWithdrawal
};
