import { createReferral, getUserReferrals, updateReferralEarnings, supabase } from '../db/supabase.js';
import { generateReferralCode } from '../utils/validation.js';

/**
 * Generate referral link for user
 */
export function generateReferralLink(botUsername, referralCode) {
  return `https://t.me/${botUsername}?start=${referralCode}`;
}

/**
 * Process referral from /start command
 */
export async function processReferral(referredUser, referralCode) {
  try {
    // Find referrer by code
    const { data: referrer, error } = await supabase
      .from('telegram_users')
      .select('*')
      .eq('referral_code', referralCode)
      .single();

    if (error || !referrer) {
      console.log('Invalid referral code:', referralCode);
      return null;
    }

    // Don't allow self-referral
    if (referrer.telegram_id === referredUser.telegram_id) {
      return null;
    }

    // Create referral relationship
    const referral = await createReferral(referrer.id, referredUser.id);
    
    if (referral) {
      console.log(`Referral created: ${referrer.telegram_id} -> ${referredUser.telegram_id}`);
    }

    return referrer;
  } catch (error) {
    console.error('Error processing referral:', error);
    return null;
  }
}

/**
 * Calculate and credit referral commission
 */
export async function creditReferralCommission(tradeUserId, profitAmount) {
  try {
    const commissionPercent = parseFloat(process.env.REFERRAL_COMMISSION_PERCENT) || 50;
    const platformFeePercent = parseFloat(process.env.PLATFORM_FEE_PERCENT) || 1;
    
    // Calculate platform fee
    const platformFee = profitAmount * (platformFeePercent / 100);
    
    // Check if this user was referred
    const { data: referral, error } = await supabase
      .from('referrals')
      .select('*, referrer:referrer_id(*)')
      .eq('referred_id', tradeUserId)
      .single();

    if (error || !referral) {
      // No referrer, full fee goes to platform
      return { platformFee, referralFee: 0 };
    }

    // Calculate referral commission (% of platform fee)
    const referralFee = platformFee * (commissionPercent / 100);
    const netPlatformFee = platformFee - referralFee;

    // Credit referrer
    await updateReferralEarnings(
      referral.id,
      referral.earnings + referralFee
    );

    // Update referrer balance
    await supabase
      .from('telegram_users')
      .update({
        balance: referral.referrer.balance + referralFee
      })
      .eq('id', referral.referrer_id);

    console.log(`Referral commission: $${referralFee.toFixed(2)} to user ${referral.referrer.telegram_id}`);

    return {
      platformFee: netPlatformFee,
      referralFee,
      referrerId: referral.referrer_id
    };
  } catch (error) {
    console.error('Error crediting referral commission:', error);
    return { platformFee: 0, referralFee: 0 };
  }
}

/**
 * Get referral statistics for user
 */
export async function getReferralStats(userId) {
  try {
    const referrals = await getUserReferrals(userId);
    
    const totalReferrals = referrals.length;
    const totalEarnings = referrals.reduce((sum, r) => sum + parseFloat(r.earnings), 0);
    const activeReferrals = referrals.filter(r => r.total_referred_trades > 0).length;

    return {
      totalReferrals,
      activeReferrals,
      totalEarnings,
      referrals
    };
  } catch (error) {
    console.error('Error getting referral stats:', error);
    return {
      totalReferrals: 0,
      activeReferrals: 0,
      totalEarnings: 0,
      referrals: []
    };
  }
}

export default {
  generateReferralLink,
  processReferral,
  creditReferralCommission,
  getReferralStats
};
