/**
 * Format USDC amount
 */
export function formatUSDC(amount) {
  if (amount === null || amount === undefined) return '$0.00';
  const num = parseFloat(amount);
  if (isNaN(num)) return '$0.00';
  
  if (Math.abs(num) >= 1000) {
    return `$${(num / 1000).toFixed(2)}k`;
  }
  return `$${num.toFixed(2)}`;
}

/**
 * Format percentage
 */
export function formatPercent(value, decimals = 2) {
  if (value === null || value === undefined) return '0%';
  const num = parseFloat(value);
  if (isNaN(num)) return '0%';
  
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(decimals)}%`;
}

/**
 * Format Ethereum address (shortened)
 */
export function formatAddress(address) {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format timestamp to relative time
 */
export function formatTimeAgo(timestamp) {
  const now = Date.now();
  const time = new Date(timestamp).getTime();
  const diff = now - time;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

/**
 * Format market outcome (YES/NO to emoji)
 */
export function formatOutcome(outcome) {
  const normalized = outcome.toUpperCase();
  if (normalized === 'YES') return '✅ YES';
  if (normalized === 'NO') return '❌ NO';
  return outcome;
}

/**
 * Format conviction score with emoji
 */
export function formatConviction(score) {
  const num = parseFloat(score);
  if (isNaN(num)) return '❓';
  
  if (num >= 90) return '🔥🔥🔥';
  if (num >= 80) return '🔥🔥';
  if (num >= 70) return '🔥';
  if (num >= 60) return '⭐';
  return '📊';
}

/**
 * Format P&L with color emoji
 */
export function formatPnL(pnl) {
  const num = parseFloat(pnl);
  if (isNaN(num)) return formatUSDC(0);
  
  const emoji = num > 0 ? '🟢' : num < 0 ? '🔴' : '⚪';
  return `${emoji} ${formatUSDC(num)}`;
}

/**
 * Escape markdown special characters for Telegram
 */
export function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * Create inline keyboard markup
 */
export function createInlineKeyboard(buttons) {
  // buttons is array of arrays: [[{text, callback_data}]]
  return {
    inline_keyboard: buttons
  };
}

/**
 * Create quick trade buttons
 */
export function createTradeButtons(marketId, outcome) {
  return createInlineKeyboard([
    [
      { text: '$10', callback_data: `trade:${marketId}:${outcome}:10` },
      { text: '$25', callback_data: `trade:${marketId}:${outcome}:25` },
      { text: '$50', callback_data: `trade:${marketId}:${outcome}:50` }
    ],
    [
      { text: '💵 Custom Amount', callback_data: `trade_custom:${marketId}:${outcome}` },
      { text: '📊 View Market', url: `https://polymarket.com/event/${marketId}` }
    ]
  ]);
}

/**
 * Format daily pick message
 */
export function formatDailyPick(pick, index) {
  const conviction = formatConviction(pick.conviction_score);
  const outcome = formatOutcome(pick.recommended_outcome);
  
  return `
${index + 1}. ${conviction} **${pick.market_title}**

📊 Conviction: ${pick.conviction_score}/100
${outcome} @ ${pick.current_price}

💡 ${pick.reasoning || 'AI analysis suggests value here'}

⏰ Closes: ${formatTimeAgo(pick.close_time)}
  `.trim();
}

/**
 * Format trader stats
 */
export function formatTraderStats(trader) {
  const winRate = ((trader.wins / trader.total_trades) * 100) || 0;
  const roi = ((trader.total_profit / trader.total_volume) * 100) || 0;
  
  return `
**${trader.name || formatAddress(trader.address)}**

📊 Win Rate: ${winRate.toFixed(1)}%
💰 Profit: ${formatUSDC(trader.total_profit)}
📈 ROI: ${formatPercent(roi)}
🎯 Trades: ${trader.total_trades}
💵 Avg Bet: ${formatUSDC(trader.avg_bet)}
  `.trim();
}

/**
 * Format portfolio position
 */
export function formatPosition(position) {
  const outcome = formatOutcome(position.outcome);
  const pnl = formatPnL(position.pnl);
  
  return `
${outcome} **${position.market_title}**

💵 Amount: ${formatUSDC(position.amount)}
📊 Entry: ${position.price?.toFixed(4)}
${pnl} (${formatPercent(position.pnl_percent)})

⏰ ${formatTimeAgo(position.created_at)}
  `.trim();
}

export default {
  formatUSDC,
  formatPercent,
  formatAddress,
  formatTimeAgo,
  formatOutcome,
  formatConviction,
  formatPnL,
  escapeMarkdown,
  createInlineKeyboard,
  createTradeButtons,
  formatDailyPick,
  formatTraderStats,
  formatPosition
};
