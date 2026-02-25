import { Markup } from 'telegraf';
import { getOrCreateUser, supabase } from '../db/supabase.js';
import { generateReferralCode } from '../utils/validation.js';
import { processReferral } from '../services/referrals.js';

export async function startCommand(ctx) {
  try {
    const telegramId = ctx.from.id;
    const username = ctx.from.username;
    const firstName = ctx.from.first_name;

    // Check for referral code in start parameter
    const startPayload = ctx.message?.text?.split(' ')[1];
    
    // Get or create user
    let user = await getOrCreateUser(telegramId, username, firstName);

    // Generate referral code if user doesn't have one
    if (!user.referral_code) {
      const referralCode = generateReferralCode(telegramId);
      const { data, error } = await supabase
        .from('telegram_users')
        .update({ referral_code: referralCode })
        .eq('id', user.id)
        .select()
        .single();
      
      if (!error) user = data;
    }

    // Process referral if code provided
    if (startPayload && startPayload.length > 0) {
      const referrer = await processReferral(user, startPayload);
      
      if (referrer) {
        await ctx.reply(
          `✅ You've been referred by ${referrer.first_name || referrer.username}!\n\n` +
          `You'll both benefit from the referral rewards.`
        );
      }
    }

    // Welcome message
    const welcomeMessage = `
🎉 **Welcome to EasyPoly!**

The simplest way to trade on Polymarket.

✨ **What I can do:**
• 📊 Daily AI picks with conviction scores
• 👥 Copy top traders automatically
• 💰 One-click trading ($10, $25, $50)
• 📈 Track your portfolio & P&L
• 🎁 Earn with referrals (50% commission!)

**Quick Start:**
1. Connect your wallet
2. Deposit USDC
3. Start copying traders or trade AI picks

Tap a button below to get started! 👇
    `.trim();

    // Show different buttons based on wallet status
    const buttons = user.wallet_address
      ? [
          [Markup.button.callback('📊 Daily Picks', 'daily_picks')],
          [
            Markup.button.callback('👥 Copy Traders', 'copy_traders'),
            Markup.button.callback('💼 Portfolio', 'portfolio')
          ],
          [
            Markup.button.callback('💰 Wallet', 'wallet'),
            Markup.button.callback('⚙️ Settings', 'settings')
          ]
        ]
      : [
          [Markup.button.callback('💳 Connect Wallet', 'wallet_connect')],
          [
            Markup.button.callback('📊 Daily Picks', 'daily_picks'),
            Markup.button.callback('👥 Copy Traders', 'copy_traders')
          ],
          [
            Markup.button.callback('❓ Help', 'help'),
            Markup.button.callback('⚙️ Settings', 'settings')
          ]
        ];

    await ctx.reply(
      welcomeMessage,
      Markup.inlineKeyboard(buttons)
    );

  } catch (error) {
    console.error('Error in start command:', error);
    await ctx.reply('Sorry, something went wrong. Please try again.');
  }
}

export async function helpCommand(ctx) {
  const helpMessage = `
📖 **EasyPoly Help**

**Commands:**
/start - Welcome & onboarding
/wallet - Manage your wallet
/picks - View daily AI picks
/copy - Copy trading setup
/portfolio - View positions & P&L
/settings - Configure bot

**How Copy Trading Works:**
1. Browse curated traders or add custom address
2. Set amount per trade
3. Bot auto-mirrors their trades
4. Get notified for each copy

**Fees:**
• Free to use
• 1% fee on winning trades only
• 50% of fees go to your referrer

**Support:**
Having issues? Contact @easypoly_support
  `.trim();

  await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
}

export default {
  startCommand,
  helpCommand
};
