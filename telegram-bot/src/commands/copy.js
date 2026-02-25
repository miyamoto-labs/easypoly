import { Markup } from 'telegraf';
import { getCuratedTraders, getUserCopyTrades, addCopyTrade, removeCopyTrade, getOrCreateUser } from '../db/supabase.js';
import { getTraderStats, hasRecentActivity } from '../services/polymarket.js';
import { isValidAddress, normalizeAddress } from '../utils/validation.js';
import { formatTraderStats, formatAddress } from '../utils/formatting.js';

export async function copyCommand(ctx) {
  try {
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);

    // Get user's current copy trades
    const copyTrades = await getUserCopyTrades(user.id);

    let statusMessage = '';
    if (copyTrades.length > 0) {
      statusMessage = `\n📊 **Your Copy Traders (${copyTrades.length})**\n` +
        copyTrades.map(ct => 
          `• ${ct.trader_name || formatAddress(ct.trader_address)} - $${ct.amount_per_trade}/trade`
        ).join('\n') + '\n';
    }

    await ctx.reply(
      '👥 **Copy Trading**\n\n' +
      'Automatically mirror trades from top Polymarket traders.\n' +
      statusMessage +
      '\n**Choose an option:**',
      Markup.inlineKeyboard([
        [Markup.button.callback('🌟 Browse Top Traders', 'copy_browse')],
        [Markup.button.callback('➕ Add Custom Trader', 'copy_custom')],
        copyTrades.length > 0 ? [Markup.button.callback('🗑 Manage Traders', 'copy_manage')] : []
      ].filter(row => row.length > 0))
    );

  } catch (error) {
    console.error('Error in copy command:', error);
    await ctx.reply('Error loading copy trading. Please try again.');
  }
}

export async function handleCopyBrowse(ctx) {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('🔍 Loading top traders...');

    const traders = await getCuratedTraders(10);

    if (!traders || traders.length === 0) {
      await ctx.reply('No curated traders available yet. Try adding a custom trader!');
      return;
    }

    await ctx.reply('🌟 **Top Polymarket Traders**\n\nThese traders are verified and profitable:');

    for (const trader of traders.slice(0, 5)) {
      const stats = formatTraderStats(trader);
      
      await ctx.reply(
        stats,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 Start Copying', `copy_start:${trader.address}`)]
          ])
        }
      );
    }

  } catch (error) {
    console.error('Error browsing traders:', error);
    await ctx.reply('Error loading traders. Please try again.');
  }
}

export async function handleCopyCustom(ctx) {
  try {
    await ctx.answerCbQuery();
    
    await ctx.reply(
      '➕ **Add Custom Trader**\n\n' +
      'Paste a Polymarket address to start copying:\n\n' +
      '**Example:**\n' +
      '`0x9d84ce0306f8551e02efef1680475fc0f1dc1344`\n\n' +
      '⚠️ **Warning:**\n' +
      'Custom traders are not verified by EasyPoly.\n' +
      'Only copy traders you trust!',
      { parse_mode: 'Markdown' }
    );

    // Set session state to expect address
    ctx.session = ctx.session || {};
    ctx.session.awaitingTraderAddress = true;

  } catch (error) {
    console.error('Error in custom copy:', error);
    await ctx.reply('Error. Please try again.');
  }
}

export async function handleTraderAddress(ctx, address) {
  try {
    // Validate address
    if (!isValidAddress(address)) {
      await ctx.reply('❌ Invalid Ethereum address. Please try again.');
      return;
    }

    const normalized = normalizeAddress(address);
    await ctx.reply('🔍 Validating trader...');

    // Check if trader has activity
    const hasActivity = await hasRecentActivity(normalized, 30);
    
    if (!hasActivity) {
      await ctx.reply(
        '⚠️ **No Recent Activity**\n\n' +
        'This address has no trades in the last 30 days.\n' +
        'Are you sure you want to copy them?',
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Yes, Add Anyway', `copy_confirm:${normalized}`)],
          [Markup.button.callback('❌ Cancel', 'copy_cancel')]
        ])
      );
      return;
    }

    // Fetch stats
    const stats = await getTraderStats(normalized);

    if (!stats) {
      await ctx.reply('❌ Could not fetch trader stats. Please try again.');
      return;
    }

    await ctx.reply(
      '📊 **Trader Preview**\n\n' +
      formatTraderStats(stats) +
      '\n\n⚠️ Not verified by EasyPoly',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Start Copying', `copy_confirm:${normalized}`)],
          [Markup.button.callback('❌ Cancel', 'copy_cancel')]
        ])
      }
    );

  } catch (error) {
    console.error('Error validating trader:', error);
    await ctx.reply('Error validating trader. Please try again.');
  }
}

export async function handleCopyConfirm(ctx, traderAddress) {
  try {
    await ctx.answerCbQuery();
    
    await ctx.reply(
      '⚙️ **Copy Settings**\n\n' +
      'How much do you want to copy per trade?\n' +
      'Choose a default amount:',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('$10', `copy_amount:${traderAddress}:10`),
          Markup.button.callback('$25', `copy_amount:${traderAddress}:25`),
          Markup.button.callback('$50', `copy_amount:${traderAddress}:50`)
        ],
        [Markup.button.callback('💬 Custom Amount', `copy_amount_custom:${traderAddress}`)]
      ])
    );

  } catch (error) {
    console.error('Error in copy confirm:', error);
    await ctx.reply('Error. Please try again.');
  }
}

export async function handleCopyAmount(ctx, traderAddress, amount) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);

    // Add copy trade configuration
    const copyTrade = await addCopyTrade(user.id, traderAddress, parseFloat(amount), true);

    await ctx.reply(
      '✅ **Copy Trade Added!**\n\n' +
      `Trader: ${formatAddress(traderAddress)}\n` +
      `Amount per trade: $${amount}\n\n` +
      '🔔 You\'ll be notified when trades are copied.\n' +
      '⚙️ Manage in /settings',
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Error adding copy trade:', error);
    await ctx.reply('Error adding copy trade. Please try again.');
  }
}

export default {
  copyCommand,
  handleCopyBrowse,
  handleCopyCustom,
  handleTraderAddress,
  handleCopyConfirm,
  handleCopyAmount
};
