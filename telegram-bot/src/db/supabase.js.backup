import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials in environment variables');
}

// Regular client for general operations
export const supabase = createClient(supabaseUrl, supabaseKey);

// Service role client for admin operations (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseKey);

/**
 * Get or create a telegram user
 */
export async function getOrCreateUser(telegramId, username = null, firstName = null) {
  try {
    // Try to find existing user
    let { data: user, error } = await supabase
      .from('telegram_users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }

    if (!user) {
      // Create new user
      const { data: newUser, error: createError } = await supabase
        .from('telegram_users')
        .insert({
          telegram_id: telegramId,
          username,
          first_name: firstName,
          settings: {
            notifications: true,
            daily_picks: true,
            copy_alerts: true,
            max_bet_amount: 50,
            auto_copy_enabled: false
          }
        })
        .select()
        .single();

      if (createError) throw createError;
      return newUser;
    }

    return user;
  } catch (error) {
    console.error('Error in getOrCreateUser:', error);
    throw error;
  }
}

/**
 * Update user settings
 */
export async function updateUserSettings(telegramId, settings) {
  const { data, error } = await supabase
    .from('telegram_users')
    .update({ settings })
    .eq('telegram_id', telegramId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get user's copy trades
 */
export async function getUserCopyTrades(userId) {
  const { data, error } = await supabase
    .from('copy_trades')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Add a new copy trade configuration
 */
export async function addCopyTrade(userId, traderAddress, amountPerTrade, customTrader = false) {
  const { data, error } = await supabase
    .from('copy_trades')
    .insert({
      user_id: userId,
      trader_address: traderAddress,
      amount_per_trade: amountPerTrade,
      status: 'active',
      custom_trader: customTrader
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Remove a copy trade configuration
 */
export async function removeCopyTrade(copyTradeId) {
  const { error } = await supabase
    .from('copy_trades')
    .update({ status: 'inactive' })
    .eq('id', copyTradeId);

  if (error) throw error;
}

/**
 * Log a bot trade
 */
export async function logBotTrade(userId, marketId, amount, outcome, orderType = 'market') {
  const { data, error } = await supabase
    .from('bot_trades')
    .insert({
      user_id: userId,
      market_id: marketId,
      amount,
      outcome,
      order_type: orderType,
      status: 'pending'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update trade status and P&L
 */
export async function updateTrade(tradeId, updates) {
  const { data, error } = await supabase
    .from('bot_trades')
    .update(updates)
    .eq('id', tradeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get user's portfolio (active positions)
 */
export async function getUserPortfolio(userId) {
  const { data, error } = await supabase
    .from('bot_trades')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get user's referrals
 */
export async function getUserReferrals(userId) {
  const { data, error } = await supabase
    .from('referrals')
    .select('*')
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Create or update referral
 */
export async function createReferral(referrerId, referredId) {
  const { data, error } = await supabase
    .from('referrals')
    .insert({
      referrer_id: referrerId,
      referred_id: referredId,
      earnings: 0
    })
    .select()
    .single();

  if (error) {
    // If already exists, just return
    if (error.code === '23505') {
      return null;
    }
    throw error;
  }
  return data;
}

/**
 * Update referral earnings
 */
export async function updateReferralEarnings(referralId, earnings) {
  const { data, error } = await supabase
    .from('referrals')
    .update({ earnings })
    .eq('id', referralId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get daily AI picks from scanner
 */
export async function getDailyPicks(limit = 3) {
  const { data, error } = await supabase
    .from('ep_curated_picks')
    .select('id, market_id, direction, conviction_score, entry_price, price, edge_explanation, question, category, slug')
    .eq('status', 'active')
    .not('question', 'is', null)
    .order('conviction_score', { ascending: false })
    .limit(limit);

  if (error) throw error;
  
  // Map to expected format
  return (data || []).map(pick => ({
    ...pick,
    market_title: pick.question,
    recommended_outcome: pick.direction,
    current_price: pick.price || pick.entry_price,
    reasoning: pick.edge_explanation,
    close_time: null // Not stored in this table
  }));
}

/**
 * Get curated traders from ep_tracked_traders table
 */
export async function getCuratedTraders(limit = 10) {
  const { data, error } = await supabase
    .from('ep_tracked_traders')
    .select('id, alias, wallet_address, roi, win_rate, total_pnl, trade_count, bankroll_tier, trading_style, composite_rank, active')
    .eq('active', true)
    .gt('roi', 0)
    .gt('total_pnl', 50000)
    .gte('win_rate', 45)
    .lt('win_rate', 95)
    .gt('trade_count', 100)
    .order('roi', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export default supabase;
