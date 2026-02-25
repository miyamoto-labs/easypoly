import { Markup } from 'telegraf';
import { getUserPortfolio, getOrCreateUser, supabase } from '../db/supabase.js';
import { formatPosition, formatUSDC, formatPercent, formatPnL, formatOutcome, formatTimeAgo } from '../utils/formatting.js';

export async function portfolioCommand(ctx) {
  try {
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);

    // Get active positions
    const positions = await getUserPortfolio(user.id);

    // Calculate summary stats
    const { data: allTrades } = await supabase
      .from('bot_trades')
      .select('pnl, created_at')
      .eq('user_id', user.id)
      .eq('status', 'closed');

    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

    const pnl24h = (allTrades || [])
      .filter(t => new Date(t.created_at).getTime() > oneDayAgo)
      .reduce((sum, t) => sum + parseFloat(t.pnl || 0), 0);

    const pnl7d = (allTrades || [])
      .filter(t => new Date(t.created_at).getTime() > sevenDaysAgo)
      .reduce((sum, t) => sum + parseFloat(t.pnl || 0), 0);

    const pnlAllTime = (allTrades || [])
      .reduce((sum, t) => sum + parseFloat(t.pnl || 0), 0);

    // Summary message
    const summaryMessage = `
📊 **Your Portfolio**

**P&L Summary:**
24h: ${formatPnL(pnl24h)}
7d: ${formatPnL(pnl7d)}
All Time: ${formatPnL(pnlAllTime)}

**Active Positions:** ${positions.length}
**Balance:** ${formatUSDC(user.balance)}
    `.trim();

    await ctx.reply(summaryMessage, { parse_mode: 'Markdown' });

    if (positions.length === 0) {
      await ctx.reply(
        '📭 **No Active Positions**\n\n' +
        'You don\'t have any open positions yet.\n' +
        'Start trading with /picks or /copy!',
        Markup.inlineKeyboard([
          [
            Markup.button.callback('📊 Daily Picks', 'daily_picks'),
            Markup.button.callback('👥 Copy Traders', 'copy_traders')
          ]
        ])
      );
      return;
    }

    // Show each position
    await ctx.reply('💼 **Active Positions:**');

    for (const position of positions.slice(0, 10)) {
      const message = formatPosition(position);
      
      await ctx.reply(
        message,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📊 Details', `position_details:${position.id}`)],
            [Markup.button.callback('💸 Sell', `position_sell:${position.id}`)]
          ])
        }
      );
    }

    if (positions.length > 10) {
      await ctx.reply(`...and ${positions.length - 10} more positions`);
    }

  } catch (error) {
    console.error('Error in portfolio command:', error);
    await ctx.reply('Error loading portfolio. Please try again.');
  }
}

export async function handlePositionDetails(ctx, positionId) {
  try {
    await ctx.answerCbQuery();

    const { data: position, error } = await supabase
      .from('bot_trades')
      .select('*')
      .eq('id', positionId)
      .single();

    if (error || !position) {
      await ctx.reply('Position not found.');
      return;
    }

    const detailsMessage = `
📊 **Position Details**

**Market:** ${position.market_title}
**Outcome:** ${formatOutcome(position.outcome)}
**Amount:** ${formatUSDC(position.amount)}
**Entry Price:** ${position.price?.toFixed(4)}
**Shares:** ${position.shares?.toFixed(2)}

**Performance:**
P&L: ${formatPnL(position.pnl)}
P&L %: ${formatPercent(position.pnl_percent)}

**Transaction:**
ID: \`${position.id}\`
Created: ${formatTimeAgo(position.created_at)}
Status: ${position.status}

[View on Polymarket](https://polymarket.com/event/${position.market_id})
    `.trim();

    await ctx.reply(detailsMessage, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...Markup.inlineKeyboard([
        [Markup.button.callback('💸 Sell Position', `position_sell:${positionId}`)],
        [Markup.button.callback('🔙 Back', 'portfolio')]
      ])
    });

  } catch (error) {
    console.error('Error showing position details:', error);
    await ctx.reply('Error loading position details.');
  }
}

export async function handlePositionSell(ctx, positionId) {
  try {
    await ctx.answerCbQuery();

    // TODO: Implement sell logic
    // 1. Get position details
    // 2. Get current market price
    // 3. Place sell order
    // 4. Update position status

    await ctx.reply(
      '💸 **Sell Position**\n\n' +
      'Selling functionality coming soon!\n\n' +
      'For now, you can sell manually on Polymarket:\n' +
      '[Open Polymarket](https://polymarket.com)',
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Error selling position:', error);
    await ctx.reply('Error selling position.');
  }
}

export default {
  portfolioCommand,
  handlePositionDetails,
  handlePositionSell
};
