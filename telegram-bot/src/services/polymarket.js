import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const CLOB_HOST = process.env.CLOB_HOST || 'https://clob.polymarket.com';
const GAMMA_API = process.env.GAMMA_API || 'https://gamma-api.polymarket.com';

/**
 * Fetch trader statistics from Polymarket
 */
export async function getTraderStats(address) {
  try {
    const response = await axios.get(`${GAMMA_API}/profile/${address}`);
    
    if (!response.data) {
      return null;
    }

    const profile = response.data;
    
    return {
      address: address,
      name: profile.name || null,
      totalTrades: profile.total_trades || 0,
      totalProfit: profile.total_profit || 0,
      totalVolume: profile.total_volume || 0,
      wins: profile.wins || 0,
      losses: profile.losses || 0,
      avgBet: profile.avg_bet || 0,
      specialty: profile.specialty || 'general',
      verified: profile.verified || false
    };
  } catch (error) {
    console.error('Error fetching trader stats:', error.message);
    return null;
  }
}

/**
 * Check if trader has recent activity
 */
export async function hasRecentActivity(address, daysBack = 7) {
  try {
    const response = await axios.get(`${GAMMA_API}/trades`, {
      params: {
        user: address,
        limit: 1,
        after: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()
      }
    });
    
    return response.data && response.data.length > 0;
  } catch (error) {
    console.error('Error checking recent activity:', error.message);
    return false;
  }
}

/**
 * Get current market data
 */
export async function getMarket(marketId) {
  try {
    const response = await axios.get(`${GAMMA_API}/markets/${marketId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching market:', error.message);
    return null;
  }
}

/**
 * Get current price for an outcome
 */
export async function getMarketPrice(marketId, outcome) {
  try {
    const market = await getMarket(marketId);
    if (!market) return null;
    
    // Find the specific outcome token
    const token = market.tokens?.find(t => 
      t.outcome.toLowerCase() === outcome.toLowerCase()
    );
    
    return token?.price || null;
  } catch (error) {
    console.error('Error fetching market price:', error.message);
    return null;
  }
}

/**
 * Place a market order on Polymarket
 */
export async function placeMarketOrder(privateKey, marketId, outcome, amount) {
  try {
    // Import Polymarket SDK
    const { ClobClient } = await import('@polymarket/clob-client');
    const { Wallet } = await import('ethers');
    
    // Create wallet from private key
    const wallet = new Wallet(privateKey);
    
    // Initialize CLOB client
    const client = new ClobClient(
      CLOB_HOST,
      137, // Polygon mainnet
      wallet
    );
    
    // Get market data to find token ID
    const market = await getMarket(marketId);
    if (!market) {
      throw new Error('Market not found');
    }
    
    // Find the outcome token
    const token = market.tokens?.find(t => 
      t.outcome.toLowerCase() === outcome.toLowerCase()
    );
    
    if (!token) {
      throw new Error(`Outcome ${outcome} not found in market`);
    }
    
    // Place market buy order
    const order = await client.createMarketBuyOrder({
      tokenID: token.token_id,
      amount: amount.toString(),
      feeRateBps: 0, // 0 basis points fee
    });
    
    return {
      success: true,
      orderId: order.orderID,
      status: order.status,
      tokenId: token.token_id,
      amount: amount,
      outcome: outcome
    };
  } catch (error) {
    console.error('Error placing order:', error);
    throw new Error(`Failed to place order: ${error.message}`);
  }
}

/**
 * Get order status
 */
export async function getOrderStatus(orderId) {
  try {
    // Placeholder - implement actual order status checking
    return {
      orderId,
      status: 'filled',
      filledAmount: 0,
      price: 0
    };
  } catch (error) {
    console.error('Error getting order status:', error);
    return null;
  }
}

/**
 * Monitor trader activity (poll for new trades)
 */
export async function getTraderRecentTrades(address, limit = 10) {
  try {
    const response = await axios.get(`${GAMMA_API}/trades`, {
      params: {
        user: address,
        limit,
        order: 'desc'
      }
    });
    
    return response.data || [];
  } catch (error) {
    console.error('Error fetching trader trades:', error.message);
    return [];
  }
}

/**
 * Validate market exists and is tradeable
 */
export async function validateMarket(marketId) {
  try {
    const market = await getMarket(marketId);
    if (!market) return false;
    
    // Check if market is still open
    const closeTime = new Date(market.end_date_iso);
    const now = new Date();
    
    return closeTime > now && market.active === true;
  } catch (error) {
    console.error('Error validating market:', error.message);
    return false;
  }
}

export default {
  getTraderStats,
  hasRecentActivity,
  getMarket,
  getMarketPrice,
  placeMarketOrder,
  getOrderStatus,
  getTraderRecentTrades,
  validateMarket
};
