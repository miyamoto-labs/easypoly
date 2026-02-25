import { Markup } from 'telegraf';
import { getDailyPicks, getOrCreateUser, logBotTrade, updateTrade } from '../db/supabase.js';
import { formatDailyPick, createTradeButtons, formatOutcome } from '../utils/formatting.js';
import { placeMarketOrder } from '../services/polymarket.js';
import { getWalletBalance } from '../services/privy.js';

export async function picksCommand(ctx) {
  try {
    await ctx.reply('📊 Loading today\'s AI picks...');

    // Get top picks from database
    const picks = await getDailyPicks(3);

    if (!picks || picks.length === 0) {
      await ctx.reply(
        '📊 **No Picks Today**\n\n' +
        'Our AI is still analyzing markets.\n' +
        'Check back soon or enable notifications to get alerted!',
        Markup.inlineKeyboard([
          [Markup.button.callback('🔔 Enable Notifications', 'settings_notifications')],
          [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ])
      );
      return;
    }

    // Send introduction
    await ctx.reply(
      '🎯 **Today\'s Top AI Picks**\n\n' +
      'Our AI analyzed hundreds of markets.\n' +
      'Here are the best opportunities:\n\n' +
      '👇 Tap an amount to trade instantly',
      { parse_mode: 'Markdown' }
    );

    // Send each pick with trade buttons
    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i];
      const message = formatDailyPick(pick, i);
      const buttons = createTradeButtons(pick.market_id, pick.recommended_outcome);

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: buttons
      });
    }

    // Add navigation at the end
    await ctx.reply(
      '━━━━━━━━━━━━━━━\n\n' +
      'Want more picks? Check back tomorrow or enable notifications!',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔔 Enable Notifications', 'settings_notifications')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ])
    );

  } catch (error) {
    console.error('Error in picks command:', error);
    await ctx.reply(
      'Error loading picks. Please try again.',
      Markup.inlineKeyboard([
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ])
    );
  }
}

export async function handleTrade(ctx, marketId, outcome, amount) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    
    // Get user
    const user = await getOrCreateUser(telegramId);

    if (!user.wallet_address) {
      await ctx.reply(
        '⚠️ **Wallet Required**\n\n' +
        'You need to create a wallet first.',
        Markup.inlineKeyboard([
          [Markup.button.callback('🔐 Create Wallet', 'wallet_create')]
        ])
      );
      return;
    }

    // Check balance
    const balance = await getWalletBalance(user.wallet_address);
    const tradeAmount = parseFloat(amount);

    if (balance < tradeAmount) {
      await ctx.reply(
        `⚠️ **Insufficient Balance**\n\n` +
        `You need $${tradeAmount} USDC.\n` +
        `Current balance: $${balance.toFixed(2)}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('💵 Deposit', 'wallet_deposit')]
        ])
      );
      return;
    }

    // Get user's private key from settings
    const privateKey = user.settings?.private_key;
    if (!privateKey) {
      await ctx.reply(
        '⚠️ **Wallet Setup Incomplete**\n\n' +
        'Please recreate your wallet to enable trading.',
        Markup.inlineKeyboard([
          [Markup.button.callback('🔐 Recreate Wallet', 'wallet_create')]
        ])
      );
      return;
    }

    // Execute trade
    await ctx.reply(`⏳ Placing $${tradeAmount} trade...`);

    const order = await placeMarketOrder(
      privateKey,
      marketId,
      outcome,
      tradeAmount
    );

    // Log trade
    const trade = await logBotTrade(user.id, marketId, tradeAmount, outcome);

    // Update with order info
    await updateTrade(trade.id, {
      status: 'active',
      price: order.price,
      tx_hash: order.orderId
    });

    await ctx.reply(
      '✅ **Trade Executed!**\n\n' +
      `Amount: $${tradeAmount}\n` +
      `Outcome: ${formatOutcome(outcome)}\n` +
      `Market: ${marketId}\n\n` +
      `Track your position in Portfolio!`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💼 Portfolio', 'portfolio')],
          [Markup.button.callback('📊 More Picks', 'daily_picks'), Markup.button.callback('🏠 Menu', 'main_menu')]
        ])
      }
    );

  } catch (error) {
    console.error('Error executing trade:', error);
    await ctx.reply(
      '❌ Trade failed. Please try again.',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Try Again', 'daily_picks')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ])
    );
  }
}

export default {
  picksCommand,
  handleTrade
};
