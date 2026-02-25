import { getTraderRecentTrades, placeMarketOrder } from './polymarket.js';
import { getUserCopyTrades, logBotTrade, updateTrade, supabase } from '../db/supabase.js';
import { getWalletBalance } from './privy.js';

/**
 * Monitor traders and execute copy trades
 */
export async function monitorAndCopyTrades(bot) {
  try {
    // Get all active copy trade configurations
    const { data: copyTrades, error } = await supabase
      .from('copy_trades')
      .select('*, telegram_users(*)')
      .eq('status', 'active');

    if (error) throw error;
    if (!copyTrades || copyTrades.length === 0) return;

    // Group by trader to minimize API calls
    const traderAddresses = [...new Set(copyTrades.map(ct => ct.trader_address))];

    for (const traderAddress of traderAddresses) {
      try {
        // Get recent trades for this trader
        const recentTrades = await getTraderRecentTrades(traderAddress, 5);
        
        // Filter trades from last 5 minutes (to avoid copying old trades)
        const now = Date.now();
        const fiveMinutesAgo = now - (5 * 60 * 1000);
        const newTrades = recentTrades.filter(trade => 
          new Date(trade.timestamp).getTime() > fiveMinutesAgo
        );

        if (newTrades.length === 0) continue;

        // For each new trade, copy for all users following this trader
        for (const trade of newTrades) {
          const copiers = copyTrades.filter(ct => ct.trader_address === traderAddress);
          
          for (const copyConfig of copiers) {
            await executeCopyTrade(bot, copyConfig, trade);
          }
        }
      } catch (error) {
        console.error(`Error monitoring trader ${traderAddress}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in monitorAndCopyTrades:', error);
  }
}

/**
 * Execute a single copy trade
 */
async function executeCopyTrade(bot, copyConfig, originalTrade) {
  try {
    const user = copyConfig.telegram_users;
    
    // Check user settings
    if (!user.settings?.auto_copy_enabled) return;

    // Check daily limits
    const todayTrades = await getTodayTradeCount(user.id);
    const maxDailyTrades = parseInt(process.env.MAX_COPY_TRADES_PER_DAY) || 20;
    
    if (todayTrades >= maxDailyTrades) {
      console.log(`User ${user.telegram_id} hit daily copy limit`);
      return;
    }

    // Calculate copy amount (use configured amount or proportional)
    const copyAmount = copyConfig.amount_per_trade;

    // Check user balance
    const balance = await getWalletBalance(user.wallet_address);
    if (balance < copyAmount) {
      // Notify user of insufficient balance
      await bot.telegram.sendMessage(
        user.telegram_id,
        `⚠️ Insufficient balance to copy trade. Need $${copyAmount.toFixed(2)}, have $${balance.toFixed(2)}`
      );
      return;
    }

    // Place the copy order
    const order = await placeMarketOrder(
      user.wallet_address,
      originalTrade.market_id,
      originalTrade.outcome,
      copyAmount
    );

    // Log the trade
    const trade = await logBotTrade(
      user.id,
      originalTrade.market_id,
      copyAmount,
      originalTrade.outcome
    );

    // Update trade with order info
    await updateTrade(trade.id, {
      copy_trade_id: copyConfig.id,
      status: 'active',
      price: originalTrade.price,
      tx_hash: order.orderId
    });

    // Send notification to user
    const traderName = copyConfig.trader_name || copyConfig.trader_address.slice(0, 8);
    await bot.telegram.sendMessage(
      user.telegram_id,
      `🔔 **Copied ${traderName}**\n\n` +
      `Market: ${originalTrade.market_title}\n` +
      `Outcome: ${originalTrade.outcome}\n` +
      `Amount: $${copyAmount.toFixed(2)}\n` +
      `Price: ${originalTrade.price?.toFixed(4)}`,
      { parse_mode: 'Markdown' }
    );

    console.log(`Copy trade executed for user ${user.telegram_id}`);
  } catch (error) {
    console.error('Error executing copy trade:', error);
  }
}

/**
 * Get number of trades today for a user
 */
async function getTodayTradeCount(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('bot_trades')
    .select('id')
    .eq('user_id', userId)
    .gte('created_at', today.toISOString());

  if (error) throw error;
  return data?.length || 0;
}

/**
 * Check if trade should be copied based on filters
 */
export function shouldCopyTrade(copyConfig, trade, userBalance) {
  // Check amount limits
  if (copyConfig.amount_per_trade > userBalance) {
    return { allow: false, reason: 'Insufficient balance' };
  }

  // Check max daily amount
  if (copyConfig.max_daily_amount) {
    // TODO: Check today's total copy amount
  }

  // Check stop loss (if previous trades from this config are in loss)
  if (copyConfig.stop_loss_percent) {
    // TODO: Check cumulative loss percentage
  }

  return { allow: true };
}

/**
 * Calculate proportional copy amount
 */
export function calculateCopyAmount(originalAmount, userConfig, userBalance) {
  // Simple version: use configured amount
  const configAmount = parseFloat(userConfig.amount_per_trade);
  
  // Ensure it doesn't exceed balance
  return Math.min(configAmount, userBalance);
}

export default {
  monitorAndCopyTrades,
  shouldCopyTrade,
  calculateCopyAmount
};
