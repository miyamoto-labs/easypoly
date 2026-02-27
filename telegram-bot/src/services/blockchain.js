import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// USDC contract address on Polygon
const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // Native USDC on Polygon

// USDC ABI (ERC20 transfer function)
const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

// Polygon RPC endpoint
const POLYGON_RPC = process.env.POLYGON_RPC || 'https://polygon-rpc.com';

/**
 * Execute USDC withdrawal on Polygon
 * @param {string} privateKey - User's private key
 * @param {string} toAddress - Recipient address
 * @param {number} amount - Amount in USDC (e.g., 50 for $50)
 * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
 */
export async function executeWithdrawal(privateKey, toAddress, amount) {
  try {
    console.log(`[Withdrawal] Initiating: $${amount} USDC to ${toAddress}`);
    
    // Connect to Polygon network
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    
    // Create wallet from private key
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Connect to USDC contract
    const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);
    
    // Get decimals (USDC has 6 decimals on Polygon)
    const decimals = await usdcContract.decimals();
    
    // Convert amount to wei (smallest unit)
    const amountWei = ethers.parseUnits(amount.toString(), decimals);
    
    // Check balance
    const balance = await usdcContract.balanceOf(wallet.address);
    
    if (balance < amountWei) {
      const balanceFormatted = ethers.formatUnits(balance, decimals);
      return {
        success: false,
        error: `Insufficient USDC balance. Have: $${balanceFormatted}, Need: $${amount}`
      };
    }
    
    // Check ETH balance for gas
    const ethBalance = await provider.getBalance(wallet.address);
    const estimatedGas = await usdcContract.transfer.estimateGas(toAddress, amountWei);
    const feeData = await provider.getFeeData();
    const estimatedGasCost = estimatedGas * (feeData.gasPrice || feeData.maxFeePerGas);
    
    if (ethBalance < estimatedGasCost) {
      const ethNeeded = ethers.formatEther(estimatedGasCost);
      return {
        success: false,
        error: `Insufficient POL for gas. Need ~${ethNeeded} POL for transaction fee.`
      };
    }
    
    console.log(`[Withdrawal] Sending transaction...`);
    
    // Execute transfer
    const tx = await usdcContract.transfer(toAddress, amountWei);
    
    console.log(`[Withdrawal] Transaction sent: ${tx.hash}`);
    console.log(`[Withdrawal] Waiting for confirmation...`);
    
    // Wait for confirmation (1 block is usually enough on Polygon)
    const receipt = await tx.wait(1);
    
    if (receipt.status === 1) {
      console.log(`[Withdrawal] ✅ Confirmed: ${tx.hash}`);
      return {
        success: true,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber
      };
    } else {
      console.error(`[Withdrawal] ❌ Transaction failed`);
      return {
        success: false,
        error: 'Transaction failed on blockchain'
      };
    }
    
  } catch (error) {
    console.error('[Withdrawal] Error:', error);
    
    // Parse common errors
    let errorMessage = 'Transaction failed';
    
    if (error.code === 'INSUFFICIENT_FUNDS') {
      errorMessage = 'Insufficient funds for transaction + gas';
    } else if (error.code === 'NONCE_EXPIRED') {
      errorMessage = 'Transaction nonce expired, please try again';
    } else if (error.message?.includes('gas')) {
      errorMessage = 'Gas estimation failed - insufficient POL for fees';
    } else if (error.message) {
      errorMessage = error.message.substring(0, 100);
    }
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Get wallet balance (USDC and POL)
 * @param {string} address - Wallet address
 * @returns {Promise<{usdc: string, pol: string}>}
 */
export async function getWalletBalances(address) {
  try {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
    
    const [usdcBalance, polBalance, decimals] = await Promise.all([
      usdcContract.balanceOf(address),
      provider.getBalance(address),
      usdcContract.decimals()
    ]);
    
    return {
      usdc: ethers.formatUnits(usdcBalance, decimals),
      pol: ethers.formatEther(polBalance)
    };
  } catch (error) {
    console.error('Error fetching balances:', error);
    return { usdc: '0', pol: '0' };
  }
}

/**
 * Estimate gas cost for withdrawal
 * @param {string} privateKey - User's private key
 * @param {string} toAddress - Recipient address
 * @param {number} amount - Amount in USDC
 * @returns {Promise<{gasCostPol: string, gasCostUsd: string}>}
 */
export async function estimateWithdrawalGas(privateKey, toAddress, amount) {
  try {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);
    const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);
    
    const decimals = await usdcContract.decimals();
    const amountWei = ethers.parseUnits(amount.toString(), decimals);
    
    const estimatedGas = await usdcContract.transfer.estimateGas(toAddress, amountWei);
    const feeData = await provider.getFeeData();
    const gasCost = estimatedGas * (feeData.gasPrice || feeData.maxFeePerGas);
    
    const gasCostPol = ethers.formatEther(gasCost);
    
    // Rough POL to USD conversion (you'd want to fetch real price)
    const gasCostUsd = (parseFloat(gasCostPol) * 0.5).toFixed(2); // Assuming $0.50 per POL
    
    return { gasCostPol, gasCostUsd };
  } catch (error) {
    console.error('Error estimating gas:', error);
    return { gasCostPol: '0.001', gasCostUsd: '0.01' };
  }
}
