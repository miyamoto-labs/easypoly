import { Markup } from 'telegraf';
import { getOrCreateUser, updateUserSettings, getUserCopyTrades } from '../db/supabase.js';
import { getReferralStats, generateReferralLink } from '../services/referrals.js';
import { formatUSDC } from '../utils/formatting.js';

export async function settingsCommand(ctx) {
  try {
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);

    const settings = user.settings || {};
    
    const settingsMessage = `
⚙️ **Settings**

**Current Configuration:**
🔔 Notifications: ${settings.notifications ? '✅ On' : '❌ Off'}
📊 Daily Picks: ${settings.daily_picks ? '✅ On' : '❌ Off'}
👥 Copy Alerts: ${settings.copy_alerts ? '✅ On' : '❌ Off'}
🤖 Auto-Copy: ${settings.auto_copy_enabled ? '✅ On' : '❌ Off'}
💰 Max Bet: $${settings.max_bet_amount || 50}

**Choose what to configure:**
    `.trim();

    await ctx.reply(
      settingsMessage,
      Markup.inlineKeyboard([
        [Markup.button.callback('🔔 Notifications', 'settings_notifications')],
        [Markup.button.callback('🤖 Auto-Copy', 'settings_autocopy')],
        [Markup.button.callback('💰 Limits', 'settings_limits')],
        [Markup.button.callback('🎁 Referrals', 'settings_referrals')],
        [Markup.button.callback('🗑 Delete Account', 'settings_delete')]
      ])
    );

  } catch (error) {
    console.error('Error in settings command:', error);
    await ctx.reply('Error loading settings. Please try again.');
  }
}

export async function handleSettingsNotifications(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);
    const settings = user.settings || {};

    await ctx.reply(
      '🔔 **Notification Settings**\n\n' +
      'Choose what you want to be notified about:',
      Markup.inlineKeyboard([
        [Markup.button.callback(
          `${settings.daily_picks ? '✅' : '⬜'} Daily Picks`,
          'toggle_daily_picks'
        )],
        [Markup.button.callback(
          `${settings.copy_alerts ? '✅' : '⬜'} Copy Trade Alerts`,
          'toggle_copy_alerts'
        )],
        [Markup.button.callback(
          `${settings.notifications ? '✅' : '⬜'} All Notifications`,
          'toggle_all_notifications'
        )],
        [Markup.button.callback('🔙 Back', 'settings')]
      ])
    );

  } catch (error) {
    console.error('Error in notifications settings:', error);
    await ctx.reply('Error. Please try again.');
  }
}

export async function handleSettingsAutoCopy(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);
    const settings = user.settings || {};

    const copyTrades = await getUserCopyTrades(user.id);

    await ctx.reply(
      '🤖 **Auto-Copy Settings**\n\n' +
      `Status: ${settings.auto_copy_enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
      `Active Traders: ${copyTrades.length}\n\n` +
      'When enabled, your followed traders\' trades are automatically copied.',
      Markup.inlineKeyboard([
        [Markup.button.callback(
          settings.auto_copy_enabled ? '⏸ Pause Auto-Copy' : '▶️ Enable Auto-Copy',
          'toggle_autocopy'
        )],
        [Markup.button.callback('🔙 Back', 'settings')]
      ])
    );

  } catch (error) {
    console.error('Error in autocopy settings:', error);
    await ctx.reply('Error. Please try again.');
  }
}

export async function handleSettingsReferrals(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);

    const stats = await getReferralStats(user.id);

    const botUsername = ctx.botInfo.username;
    const referralLink = generateReferralLink(botUsername, user.referral_code);

    const referralMessage = `
🎁 **Referral Program**

**Your Stats:**
👥 Total Referrals: ${stats.totalReferrals}
✅ Active: ${stats.activeReferrals}
💰 Earnings: ${formatUSDC(stats.totalEarnings)}

**Your Referral Link:**
\`${referralLink}\`

**How it works:**
• Share your link with friends
• They sign up using your link
• You earn 50% of their trading fees
• Passive income from their trades!

Tap to copy your link 👆
    `.trim();

    await ctx.reply(referralMessage, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in referrals:', error);
    await ctx.reply('Error loading referral stats.');
  }
}

export async function handleToggleSetting(ctx, setting) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);
    const settings = user.settings || {};

    // Toggle the setting
    settings[setting] = !settings[setting];

    // Update in database
    await updateUserSettings(telegramId, settings);

    await ctx.reply(
      `✅ Setting updated: ${setting} is now ${settings[setting] ? 'ON' : 'OFF'}`
    );

    // Refresh settings menu
    await settingsCommand(ctx);

  } catch (error) {
    console.error('Error toggling setting:', error);
    await ctx.reply('Error updating setting.');
  }
}

export default {
  settingsCommand,
  handleSettingsNotifications,
  handleSettingsAutoCopy,
  handleSettingsReferrals,
  handleToggleSetting
};
