import { Markup } from 'telegraf';
import { getOrCreateUser, getUserCopyTrades, saveCopyTradeConfig, removeCopyTrade } from '../db/supabase.js';
import { getTraderStats } from '../services/polymarket.js';
import { isValidAddress, normalizeAddress } from '../utils/validation.js';
import { formatAddress } from '../utils/formatting.js';

// In-memory session storage for wizard state
// In production, use telegraf-session or DB-backed sessions
const configSessions = new Map();

// Default configuration values
const DEFAULT_CONFIG = {
  amount: 25,
  positionPct: 100,
  maxTrades: 5,
  maxExposure: 500,
  stopLoss: null,
  takeProfit: null,
  autoClose: true,
  copyBuys: true,
  copySells: true,
  slippage: 2.0
};

// ============================================================================
// MAIN COMMAND
// ============================================================================

export async function copyCommand(ctx) {
  try {
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId, ctx.from.username, ctx.from.first_name);

    // Get user's current copy trades
    const copyTrades = await getUserCopyTrades(user.id);

    let statusMessage = '';
    if (copyTrades.length > 0) {
      statusMessage = `\n📊 **Your Active Copy Trades (${copyTrades.length})**\n` +
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
        [Markup.button.callback('➕ Add Trader', 'copy_add')],
        copyTrades.length > 0 ? [Markup.button.callback('⚙️ Manage Traders', 'copy_manage')] : []
      ].filter(row => row.length > 0))
    );

  } catch (error) {
    console.error('Error in copy command:', error);
    await ctx.reply('❌ Error loading copy trading. Please try again.');
  }
}

// ============================================================================
// ADD TRADER FLOW
// ============================================================================

export async function handleCopyAdd(ctx) {
  try {
    // Don't answer callback query to avoid "query too old" errors
    
    await ctx.reply(
      '➕ **Add Trader to Copy**\n\n' +
      'Paste a Polymarket wallet address:\n\n' +
      '**Example:**\n' +
      '`0x2d4bf8f846bf68f43b9157bf30810d334ac6ca7a`\n\n' +
      '💡 You can find trader addresses on polymarket.com/profile',
      { parse_mode: 'Markdown' }
    );

    // Mark user as awaiting address input
    const session = configSessions.get(ctx.from.id) || {};
    session.awaitingAddress = true;
    configSessions.set(ctx.from.id, session);

  } catch (error) {
    console.error('Error in handleCopyAdd:', error);
    await ctx.reply('❌ Error. Please try again.');
  }
}

// Handle pasted address
export async function handleTraderAddressInput(ctx, address) {
  try {
    const normalized = normalizeAddress(address);
    
    if (!isValidAddress(normalized)) {
      await ctx.reply('❌ Invalid address format. Please try again with a valid Ethereum address.');
      return;
    }

    // Fetch trader stats
    await ctx.reply('🔍 Fetching trader data...');
    
    const stats = await getTraderStats(normalized);
    
    if (!stats) {
      await ctx.reply('❌ Could not find this trader on Polymarket. Please check the address and try again.');
      return;
    }

    // Start configuration wizard
    await showTraderPreview(ctx, normalized, stats);

  } catch (error) {
    console.error('Error handling address:', error);
    await ctx.reply('❌ Error fetching trader data. Please try again.');
  }
}

// ============================================================================
// WIZARD STEP 0: TRADER PREVIEW
// ============================================================================

async function showTraderPreview(ctx, address, stats) {
  const session = configSessions.get(ctx.from.id) || {};
  session.address = address;
  session.traderName = stats.name || 'Unknown Trader';
  session.step = 0;
  session.awaitingAddress = false;
  configSessions.set(ctx.from.id, session);

  await ctx.reply(
    `🎯 **Copy This Trader?**\n\n` +
    `👤 **${stats.name || 'Unknown Trader'}**\n` +
    `📊 ROI: ${stats.roi?.toFixed(1) || 0}% | Win Rate: ${stats.winRate?.toFixed(1) || 0}%\n` +
    `💰 Profit: $${stats.totalPnl?.toLocaleString() || 0} (30 days)\n` +
    `📈 ${stats.tradeCount || 0} trades | ${stats.marketsTraded || 0} markets\n\n` +
    `💡 Configure how to copy their trades`,
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Yes, Configure', 'wizard_start')],
      [Markup.button.callback('❌ Cancel', 'wizard_cancel')]
    ])
  );
}

// ============================================================================
// WIZARD STEP 1: TRADE SIZE
// ============================================================================

export async function wizardStep1_TradeSize(ctx) {
  try {
    await ctx.answerCbQuery(); // Disabled to prevent timeout errors
    
    const session = configSessions.get(ctx.from.id) || {};
    session.step = 1;
    session.config = { ...DEFAULT_CONFIG };
    configSessions.set(ctx.from.id, session);

    await ctx.editMessageText(
      `💵 **How much per trade?** (1/6)\n\n` +
      `Choose a preset amount:\n\n` +
      `💡 Tip: Start with $25-50 while testing`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('$10', 'config_amount:10'),
          Markup.button.callback('$25 ✓', 'config_amount:25'),
          Markup.button.callback('$50', 'config_amount:50')
        ],
        [
          Markup.button.callback('$100', 'config_amount:100'),
          Markup.button.callback('$250', 'config_amount:250')
        ],
        [Markup.button.callback('Next ➡️', 'wizard_next')]
      ])
    );
  } catch (error) {
    console.error('Error in wizardStep1:', error);
  }
}

// ============================================================================
// WIZARD STEP 2: POSITION MIRRORING
// ============================================================================

export async function wizardStep2_PositionSize(ctx) {
  try {
    await ctx.answerCbQuery(); // Disabled to prevent timeout errors
    
    const session = configSessions.get(ctx.from.id);
    const config = session.config;
    session.step = 2;
    configSessions.set(ctx.from.id, session);

    const exampleBet = (1000 * config.positionPct / 100).toFixed(0);

    await ctx.editMessageText(
      `📐 **Mirror size: How much of their trades?** (2/6)\n\n` +
      `If they bet $1,000, you bet $${exampleBet}\n\n` +
      `💡 Lower % = more conservative`,
      Markup.inlineKeyboard([
        [Markup.button.callback('100% ✓', 'config_position:100')],
        [Markup.button.callback('50%', 'config_position:50')],
        [Markup.button.callback('25%', 'config_position:25')],
        [
          Markup.button.callback('⬅️ Back', 'wizard_back'),
          Markup.button.callback('Next ➡️', 'wizard_next')
        ]
      ])
    );
  } catch (error) {
    console.error('Error in wizardStep2:', error);
  }
}

// ============================================================================
// WIZARD STEP 3: SAFETY LIMITS
// ============================================================================

export async function wizardStep3_SafetyLimits(ctx) {
  try {
    await ctx.answerCbQuery(); // Disabled to prevent timeout errors
    
    const session = configSessions.get(ctx.from.id);
    const config = session.config;
    session.step = 3;
    configSessions.set(ctx.from.id, session);

    await ctx.editMessageText(
      `🛡️ **Safety Limits** (3/6)\n\n` +
      `**Max open trades:** ${config.maxTrades}\n` +
      `Prevents too many positions at once\n\n` +
      `**Max exposure:** $${config.maxExposure}\n` +
      `Total USD limit across all trades`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('1', 'config_maxtrades:1'),
          Markup.button.callback('3', 'config_maxtrades:3'),
          Markup.button.callback('5 ✓', 'config_maxtrades:5'),
          Markup.button.callback('10', 'config_maxtrades:10')
        ],
        [
          Markup.button.callback('$100', 'config_exposure:100'),
          Markup.button.callback('$500 ✓', 'config_exposure:500'),
          Markup.button.callback('$1K', 'config_exposure:1000'),
          Markup.button.callback('$5K', 'config_exposure:5000')
        ],
        [
          Markup.button.callback('⬅️ Back', 'wizard_back'),
          Markup.button.callback('Next ➡️', 'wizard_next')
        ]
      ])
    );
  } catch (error) {
    console.error('Error in wizardStep3:', error);
  }
}

// ============================================================================
// WIZARD STEP 4: AUTO-MANAGEMENT (OPTIONAL)
// ============================================================================

export async function wizardStep4_AutoManagement(ctx) {
  try {
    await ctx.answerCbQuery(); // Disabled to prevent timeout errors
    
    const session = configSessions.get(ctx.from.id);
    const config = session.config;
    session.step = 4;
    configSessions.set(ctx.from.id, session);

    const slText = config.stopLoss ? `${config.stopLoss}%` : 'None';
    const tpText = config.takeProfit ? `+${config.takeProfit}%` : 'None';

    await ctx.editMessageText(
      `🎚️ **Auto-Management** (4/6) _(Optional)_\n\n` +
      `**Stop Loss:** ${slText}\n` +
      `Auto-close at this loss %\n\n` +
      `**Take Profit:** ${tpText}\n` +
      `Auto-close at this profit %`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('No SL ✓', 'config_sl:0'),
          Markup.button.callback('-10%', 'config_sl:-10'),
          Markup.button.callback('-20%', 'config_sl:-20'),
          Markup.button.callback('-50%', 'config_sl:-50')
        ],
        [
          Markup.button.callback('No TP ✓', 'config_tp:0'),
          Markup.button.callback('+20%', 'config_tp:20'),
          Markup.button.callback('+50%', 'config_tp:50'),
          Markup.button.callback('+100%', 'config_tp:100')
        ],
        [
          Markup.button.callback('⬅️ Back', 'wizard_back'),
          Markup.button.callback('Skip ⏭️', 'wizard_next'),
          Markup.button.callback('Next ➡️', 'wizard_next')
        ]
      ])
    );
  } catch (error) {
    console.error('Error in wizardStep4:', error);
  }
}

// ============================================================================
// WIZARD STEP 5: TRADE FILTERS
// ============================================================================

export async function wizardStep5_Filters(ctx) {
  try {
    await ctx.answerCbQuery(); // Disabled to prevent timeout errors
    
    const session = configSessions.get(ctx.from.id);
    const config = session.config;
    session.step = 5;
    configSessions.set(ctx.from.id, session);

    const buyCheck = config.copyBuys ? '☑️' : '☐';
    const sellCheck = config.copySells ? '☑️' : '☐';
    const autoCloseCheck = config.autoClose ? '☑️' : '☐';

    await ctx.editMessageText(
      `🎯 **What to copy?** (5/6)\n\n` +
      `${buyCheck} BUY positions (long)\n` +
      `${sellCheck} SELL positions (short)\n\n` +
      `${autoCloseCheck} Auto-close when they exit\n\n` +
      `Slippage tolerance: ${config.slippage}%`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(`${buyCheck} Buys`, 'config_toggle_buys'),
          Markup.button.callback(`${sellCheck} Sells`, 'config_toggle_sells')
        ],
        [Markup.button.callback(`${autoCloseCheck} Auto-close`, 'config_toggle_autoclose')],
        [
          Markup.button.callback('0.5%', 'config_slip:0.5'),
          Markup.button.callback('1%', 'config_slip:1'),
          Markup.button.callback('2% ✓', 'config_slip:2'),
          Markup.button.callback('5%', 'config_slip:5')
        ],
        [
          Markup.button.callback('⬅️ Back', 'wizard_back'),
          Markup.button.callback('Next ➡️', 'wizard_next')
        ]
      ])
    );
  } catch (error) {
    console.error('Error in wizardStep5:', error);
  }
}

// ============================================================================
// WIZARD STEP 6: REVIEW & CONFIRM
// ============================================================================

export async function wizardStep6_Review(ctx) {
  try {
    await ctx.answerCbQuery(); // Disabled to prevent timeout errors
    
    const session = configSessions.get(ctx.from.id);
    const config = session.config;
    session.step = 6;
    configSessions.set(ctx.from.id, session);

    const slText = config.stopLoss ? `${config.stopLoss}%` : 'None';
    const tpText = config.takeProfit ? `+${config.takeProfit}%` : 'None';
    const copyText = [
      config.copyBuys ? 'Buys' : null,
      config.copySells ? 'Sells' : null
    ].filter(Boolean).join(' & ');

    await ctx.editMessageText(
      `📋 **Review Configuration** (6/6)\n\n` +
      `👤 Trader: ${session.traderName}\n` +
      `💵 Amount per trade: $${config.amount}\n` +
      `📐 Mirror size: ${config.positionPct}%\n` +
      `🛡️ Max trades: ${config.maxTrades}\n` +
      `💰 Max exposure: $${config.maxExposure}\n` +
      `📊 SL: ${slText} | TP: ${tpText}\n` +
      `✅ Copy: ${copyText}\n` +
      `🔄 Auto-close: ${config.autoClose ? 'Yes' : 'No'}\n` +
      `⚡ Slippage: ${config.slippage}%`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🚀 Activate Copy Trading', 'wizard_activate')],
        [
          Markup.button.callback('⬅️ Back', 'wizard_back'),
          Markup.button.callback('❌ Cancel', 'wizard_cancel')
        ]
      ])
    );
  } catch (error) {
    console.error('Error in wizardStep6:', error);
  }
}

// ============================================================================
// WIZARD ACTIVATION
// ============================================================================

export async function wizardActivate(ctx) {
  try {
    await ctx.answerCbQuery('Activating...');
    
    const session = configSessions.get(ctx.from.id);
    const config = session.config;
    
    // Get or create user
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
    
    // Save to database
    await saveCopyTradeConfig(user.id, session.address, {
      trader_name: session.traderName,
      amount_per_trade: config.amount,
      position_size_pct: config.positionPct,
      max_trades_per_trader: config.maxTrades,
      max_exposure_per_trader: config.maxExposure,
      slippage_tolerance: config.slippage,
      stop_loss_pct: config.stopLoss,
      take_profit_pct: config.takeProfit,
      auto_close_on_exit: config.autoClose,
      copy_buys: config.copyBuys,
      copy_sells: config.copySells,
      config_completed: true,
      status: 'active'
    });
    
    // Clear session
    configSessions.delete(ctx.from.id);
    
    await ctx.editMessageText(
      `✅ **Copy Trading Active!**\n\n` +
      `You'll now copy ${session.traderName}'s trades automatically.\n\n` +
      `🔔 You'll get alerts for:\n` +
      `• New positions opened\n` +
      `• Positions closed\n` +
      `• Profit/loss updates\n\n` +
      `Use /copy to manage your copy traders.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ])
    );
  } catch (error) {
    console.error('Error activating copy trade:', error);
    await ctx.reply('❌ Error activating copy trading. Please try again.');
  }
}

// ============================================================================
// WIZARD NAVIGATION
// ============================================================================

export async function wizardNext(ctx) {
  const session = configSessions.get(ctx.from.id);
  if (!session) return;
  
  const stepHandlers = [
    null, // step 0 = preview
    wizardStep2_PositionSize,
    wizardStep3_SafetyLimits,
    wizardStep4_AutoManagement,
    wizardStep5_Filters,
    wizardStep6_Review,
    wizardActivate
  ];
  
  const nextStep = session.step + 1;
  if (nextStep < stepHandlers.length && stepHandlers[nextStep]) {
    await stepHandlers[nextStep](ctx);
  }
}

export async function wizardBack(ctx) {
  const session = configSessions.get(ctx.from.id);
  if (!session) return;
  
  const stepHandlers = [
    null, // step 0 = preview
    wizardStep1_TradeSize,
    wizardStep2_PositionSize,
    wizardStep3_SafetyLimits,
    wizardStep4_AutoManagement,
    wizardStep5_Filters
  ];
  
  const prevStep = session.step - 1;
  if (prevStep >= 0 && stepHandlers[prevStep]) {
    await stepHandlers[prevStep](ctx);
  }
}

export async function wizardCancel(ctx) {
  try {
    await ctx.answerCbQuery('Cancelled');
    configSessions.delete(ctx.from.id);
    await ctx.editMessageText(
      '❌ Copy trading setup cancelled.\n\nUse /copy to try again.',
      Markup.inlineKeyboard([
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ])
    );
  } catch (error) {
    console.error('Error cancelling wizard:', error);
  }
}

// ============================================================================
// CONFIG CALLBACKS
// ============================================================================

export async function handleConfigAmount(ctx, amount) {
  const session = configSessions.get(ctx.from.id);
  if (!session) return;
  
  await ctx.answerCbQuery(`Set to $${amount}`);
  session.config.amount = parseFloat(amount);
  configSessions.set(ctx.from.id, session);
  
  // Re-render current step
  await wizardStep1_TradeSize(ctx);
}

export async function handleConfigPosition(ctx, pct) {
  const session = configSessions.get(ctx.from.id);
  if (!session) return;
  
  await ctx.answerCbQuery(`Set to ${pct}%`);
  session.config.positionPct = parseFloat(pct);
  configSessions.set(ctx.from.id, session);
  
  await wizardStep2_PositionSize(ctx);
}

export async function handleConfigMaxTrades(ctx, max) {
  const session = configSessions.get(ctx.from.id);
  if (!session) return;
  
  await ctx.answerCbQuery(`Set to ${max}`);
  session.config.maxTrades = parseInt(max);
  configSessions.set(ctx.from.id, session);
  
  await wizardStep3_SafetyLimits(ctx);
}

export async function handleConfigExposure(ctx, exposure) {
  const session = configSessions.get(ctx.from.id);
  if (!session) return;
  
  await ctx.answerCbQuery(`Set to $${exposure}`);
  session.config.maxExposure = parseFloat(exposure);
  configSessions.set(ctx.from.id, session);
  
  await wizardStep3_SafetyLimits(ctx);
}

export async function handleConfigStopLoss(ctx, sl) {
  const session = configSessions.get(ctx.from.id);
  if (!session) return;
  
  const value = parseFloat(sl);
  await ctx.answerCbQuery(value === 0 ? 'No stop loss' : `Stop loss: ${sl}%`);
  session.config.stopLoss = value === 0 ? null : value;
  configSessions.set(ctx.from.id, session);
  
  await wizardStep4_AutoManagement(ctx);
}

export async function handleConfigTakeProfit(ctx, tp) {
  const session = configSessions.get(ctx.from.id);
  if (!session) return;
  
  const value = parseFloat(tp);
  await ctx.answerCbQuery(value === 0 ? 'No take profit' : `Take profit: +${tp}%`);
  session.config.takeProfit = value === 0 ? null : value;
  configSessions.set(ctx.from.id, session);
  
  await wizardStep4_AutoManagement(ctx);
}

export async function handleConfigToggleBuys(ctx) {
  const session = configSessions.get(ctx.from.id);
  if (!session) return;
  
  session.config.copyBuys = !session.config.copyBuys;
  await ctx.answerCbQuery(session.config.copyBuys ? 'Buys enabled' : 'Buys disabled');
  configSessions.set(ctx.from.id, session);
  
  await wizardStep5_Filters(ctx);
}

export async function handleConfigToggleSells(ctx) {
  const session = configSessions.get(ctx.from.id);
  if (!session) return;
  
  session.config.copySells = !session.config.copySells;
  await ctx.answerCbQuery(session.config.copySells ? 'Sells enabled' : 'Sells disabled');
  configSessions.set(ctx.from.id, session);
  
  await wizardStep5_Filters(ctx);
}

export async function handleConfigToggleAutoClose(ctx) {
  const session = configSessions.get(ctx.from.id);
  if (!session) return;
  
  session.config.autoClose = !session.config.autoClose;
  await ctx.answerCbQuery(session.config.autoClose ? 'Auto-close enabled' : 'Auto-close disabled');
  configSessions.set(ctx.from.id, session);
  
  await wizardStep5_Filters(ctx);
}

export async function handleConfigSlippage(ctx, slip) {
  const session = configSessions.get(ctx.from.id);
  if (!session) return;
  
  await ctx.answerCbQuery(`Slippage: ${slip}%`);
  session.config.slippage = parseFloat(slip);
  configSessions.set(ctx.from.id, session);
  
  await wizardStep5_Filters(ctx);
}

// ============================================================================
// MANAGE TRADERS
// ============================================================================

export async function handleCopyManage(ctx) {
  try {
    await ctx.answerCbQuery(); // Disabled to prevent timeout errors
    
    const user = await getOrCreateUser(ctx.from.id);
    const copyTrades = await getUserCopyTrades(user.id);
    
    if (copyTrades.length === 0) {
      await ctx.editMessageText(
        '📊 **No Active Copy Trades**\n\nUse /copy to add traders to copy.',
        Markup.inlineKeyboard([[Markup.button.callback('➕ Add Trader', 'copy_add')]])
      );
      return;
    }
    
    let message = '⚙️ **Manage Copy Traders**\n\n';
    const buttons = [];
    
    for (const ct of copyTrades) {
      message += `👤 ${ct.trader_name || formatAddress(ct.trader_address)}\n`;
      message += `💵 $${ct.amount_per_trade}/trade | `;
      message += `${ct.position_size_pct}% mirror | `;
      message += `${ct.max_trades_per_trader} max trades\n\n`;
      
      buttons.push([
        Markup.button.callback(`🗑 Remove ${ct.trader_name || 'Trader'}`, `copy_remove:${ct.id}`)
      ]);
    }
    
    buttons.push([Markup.button.callback('➕ Add Another', 'copy_add')]);
    buttons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);
    
    await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
    
  } catch (error) {
    console.error('Error in handleCopyManage:', error);
    await ctx.reply('❌ Error loading copy trades.');
  }
}

export async function handleCopyRemove(ctx, copyTradeId) {
  try {
    await ctx.answerCbQuery('Removing...');
    await removeCopyTrade(copyTradeId);
    await ctx.reply('✅ Copy trade removed successfully.');
    await handleCopyManage(ctx);
  } catch (error) {
    console.error('Error removing copy trade:', error);
    await ctx.reply('❌ Error removing copy trade.');
  }
}

// ============================================================================
// TEXT INPUT HANDLER (for address paste)
// ============================================================================


// Handle custom amount input
export async function handleConfigAmountCustom(ctx) {
  const session = configSessions.get(ctx.from.id);
  if (!session) return;
  
  session.awaitingCustomAmount = true;
  configSessions.set(ctx.from.id, session);
  
  await ctx.reply(
    '💵 **Enter Custom Amount**\n\n' +
    'Type the amount you want per trade:\n\n' +
    '• Minimum: $5\n' +
    '• Maximum: $1,000\n\n' +
    'Example: type `100` for $100 per trade',
    { parse_mode: 'Markdown' }
  );
}
export async function handleTextInput(ctx) {
  const session = configSessions.get(ctx.from.id);
  
  // Handle custom amount input
  if (session && session.awaitingCustomAmount) {
    const amount = parseFloat(ctx.message.text);
    
    if (isNaN(amount) || amount < 5 || amount > 1000) {
      await ctx.reply('❌ Invalid amount. Please enter a number between 5 and 1000.');
      return;
    }
    
    session.config.amount = amount;
    session.awaitingCustomAmount = false;
    configSessions.set(ctx.from.id, session);
    
    await ctx.reply(`✅ Set to $${amount} per trade`);
    await wizardStep1_TradeSize(ctx);
    return;
  }
  
  // Handle address input
  if (session && session.awaitingAddress) {
    await handleTraderAddressInput(ctx, ctx.message.text);
  }
}
