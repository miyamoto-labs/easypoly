import { Telegraf, session, Markup } from 'telegraf';
import dotenv from 'dotenv';
import { CronJob } from 'cron';

// Load environment variables
dotenv.config();

// Import commands
import { startCommand, helpCommand } from './commands/start.js';
import { walletCommand, handleWalletCreate, handleWalletDeposit, handleWalletWithdraw, handleWalletTransactions } from './commands/wallet.js';
import { picksCommand, handleTrade } from './commands/picks.js';
import { 
  copyCommand, 
  handleCopyBrowse, 
  handleCopyCustom, 
  handleTraderAddress,
  handleCopyConfirm,
  handleCopyAmount
} from './commands/copy.js';
import { portfolioCommand, handlePositionDetails, handlePositionSell } from './commands/portfolio.js';
import { 
  settingsCommand, 
  handleSettingsNotifications, 
  handleSettingsAutoCopy,
  handleSettingsReferrals,
  handleToggleSetting
} from './commands/settings.js';

// Import services
import { monitorAndCopyTrades } from './services/copyTrade.js';
import { supabase } from './db/supabase.js';

// Validate required environment variables
const requiredEnvVars = ['TELEGRAM_BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Enable session middleware
bot.use(session());

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

bot.command('start', startCommand);
bot.command('help', helpCommand);
bot.command('wallet', walletCommand);
bot.command('picks', picksCommand);
bot.command('copy', copyCommand);
bot.command('portfolio', portfolioCommand);
bot.command('settings', settingsCommand);

// ============================================================================
// CALLBACK QUERY HANDLERS
// ============================================================================

// Main menu / navigation
bot.action('main_menu', startCommand);
bot.action('help', helpCommand);

// Wallet callbacks
bot.action('wallet', walletCommand);
bot.action('wallet_connect', handleWalletCreate);
bot.action('wallet_create', handleWalletCreate);
bot.action('wallet_deposit', handleWalletDeposit);
bot.action('wallet_withdraw', handleWalletWithdraw);
bot.action('wallet_txns', handleWalletTransactions);

// Picks callbacks
bot.action('daily_picks', picksCommand);

// Copy trading callbacks
bot.action('copy_traders', copyCommand);
bot.action('copy_browse', handleCopyBrowse);
bot.action('copy_custom', handleCopyCustom);
bot.action('copy_cancel', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.awaitingTraderAddress = false;
  await ctx.reply('❌ Cancelled');
});

// Copy confirm/amount handlers
bot.action(/^copy_confirm:(.+)$/, async (ctx) => {
  const traderAddress = ctx.match[1];
  await handleCopyConfirm(ctx, traderAddress);
});

bot.action(/^copy_amount:(.+):(\d+)$/, async (ctx) => {
  const traderAddress = ctx.match[1];
  const amount = ctx.match[2];
  await handleCopyAmount(ctx, traderAddress, amount);
});

// Trade execution callbacks
bot.action(/^trade_custom:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const marketId = ctx.match[1];
  const outcome = ctx.match[2];
  
  ctx.session.awaitingCustomAmount = { marketId, outcome };
  await ctx.reply(
    '💵 **Enter Custom Amount**\n\n' +
    'Type the amount you want to bet in USD (e.g., 15, 100, 500)\n\n' +
    '_Minimum: $1 • Maximum: $1000_',
    { parse_mode: 'Markdown' }
  );
});

bot.action(/^trade:(.+):(.+):(\d+)$/, async (ctx) => {
  const marketId = ctx.match[1];
  const outcome = ctx.match[2];
  const amount = ctx.match[3];
  await handleTrade(ctx, marketId, outcome, amount);
});

// Portfolio callbacks
bot.action('portfolio', portfolioCommand);
bot.action(/^position_details:(.+)$/, async (ctx) => {
  const positionId = ctx.match[1];
  await handlePositionDetails(ctx, positionId);
});
bot.action(/^position_sell:(.+)$/, async (ctx) => {
  const positionId = ctx.match[1];
  await handlePositionSell(ctx, positionId);
});

// Settings callbacks
bot.action('settings', settingsCommand);
bot.action('settings_notifications', handleSettingsNotifications);
bot.action('settings_autocopy', handleSettingsAutoCopy);
bot.action('settings_referrals', handleSettingsReferrals);

// Toggle setting callbacks
bot.action('toggle_daily_picks', (ctx) => handleToggleSetting(ctx, 'daily_picks'));
bot.action('toggle_copy_alerts', (ctx) => handleToggleSetting(ctx, 'copy_alerts'));
bot.action('toggle_all_notifications', (ctx) => handleToggleSetting(ctx, 'notifications'));
bot.action('toggle_autocopy', (ctx) => handleToggleSetting(ctx, 'auto_copy_enabled'));

// ============================================================================
// TEXT MESSAGE HANDLERS
// ============================================================================

bot.on('text', async (ctx) => {
  // Check if user is waiting to enter custom amount
  if (ctx.session?.awaitingCustomAmount) {
    const { marketId, outcome } = ctx.session.awaitingCustomAmount;
    ctx.session.awaitingCustomAmount = null;
    
    const amount = parseFloat(ctx.message.text);
    
    if (isNaN(amount) || amount < 1 || amount > 1000) {
      await ctx.reply(
        '❌ Invalid amount. Please enter a number between $1 and $1000.',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Try Again', `trade_custom:${marketId}:${outcome}`)],
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
          ])
        }
      );
      return;
    }
    
    await handleTrade(ctx, marketId, outcome, amount);
    return;
  }
  
  // Check if user is in a flow (e.g., awaiting trader address)
  if (ctx.session?.awaitingTraderAddress) {
    ctx.session.awaitingTraderAddress = false;
    await handleTraderAddress(ctx, ctx.message.text);
    return;
  }

  // Default: suggest using commands
  await ctx.reply(
    '👋 Hi! Use /start to see all available commands.',
    {
      reply_markup: {
        keyboard: [
          [{ text: '📊 Daily Picks' }, { text: '👥 Copy Traders' }],
          [{ text: '💼 Portfolio' }, { text: '⚙️ Settings' }]
        ],
        resize_keyboard: true
      }
    }
  );
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ An error occurred. Please try again or contact support.');
});

// ============================================================================
// BACKGROUND JOBS
// ============================================================================

// Monitor traders and execute copy trades (every 2 minutes)
const copyTradeMonitor = new CronJob('*/2 * * * *', async () => {
  console.log('🔍 Monitoring traders for copy trades...');
  try {
    await monitorAndCopyTrades(bot);
  } catch (error) {
    console.error('Error in copy trade monitor:', error);
  }
});

// Send daily picks notification (9 AM UTC)
const dailyPicksNotifier = new CronJob('0 9 * * *', async () => {
  console.log('📊 Sending daily picks to subscribers...');
  try {
    // Get users with daily picks enabled
    const { data: users } = await supabase
      .from('telegram_users')
      .select('telegram_id')
      .eq('settings->daily_picks', true);

    if (!users || users.length === 0) return;

    // Send picks to each user
    for (const user of users) {
      try {
        await bot.telegram.sendMessage(
          user.telegram_id,
          '🌅 Good morning! Today\'s AI picks are ready.\n\nUse /picks to view them!'
        );
      } catch (error) {
        console.error(`Failed to send picks to ${user.telegram_id}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error in daily picks notifier:', error);
  }
});

// ============================================================================
// START BOT
// ============================================================================

async function startBot() {
  try {
    // Test database connection
    const { error } = await supabase.from('telegram_users').select('count').limit(1);
    if (error) {
      console.error('❌ Database connection failed:', error.message);
      process.exit(1);
    }
    console.log('✅ Database connected');

    // Start background jobs
    copyTradeMonitor.start();
    dailyPicksNotifier.start();
    console.log('✅ Background jobs started');

    // Launch bot
    await bot.launch();
    console.log('🤖 EasyPoly Telegram Bot is running!');

    // Graceful shutdown
    process.once('SIGINT', () => {
      console.log('⏹ Stopping bot...');
      copyTradeMonitor.stop();
      dailyPicksNotifier.stop();
      bot.stop('SIGINT');
    });
    
    process.once('SIGTERM', () => {
      console.log('⏹ Stopping bot...');
      copyTradeMonitor.stop();
      dailyPicksNotifier.stop();
      bot.stop('SIGTERM');
    });

  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

// Start the bot
startBot();

export default bot;
