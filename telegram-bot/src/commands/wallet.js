import { Markup } from 'telegraf';
import { createUserWallet, getWalletBalance, getDepositAddress } from '../services/privy.js';
import { getOrCreateUser, supabase } from '../db/supabase.js';
import { formatUSDC, formatAddress } from '../utils/formatting.js';

export async function walletCommand(ctx) {
  try {
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId, ctx.from.username, ctx.from.first_name);

    // Check if wallet exists
    if (!user.wallet_address) {
      await ctx.reply(
        '💳 **No Wallet Connected**\n\n' +
        'You need to create a wallet to start trading.\n' +
        'We\'ll create a secure embedded wallet for you.',
        Markup.inlineKeyboard([
          [Markup.button.callback('🔐 Create Wallet', 'wallet_create')]
        ])
      );
      return;
    }

    // Get balance
    const balance = await getWalletBalance(user.wallet_address);

    const walletMessage = `
💳 **Your Wallet**

Address: \`${user.wallet_address}\`
Balance: ${formatUSDC(balance)} USDC

**Available Actions:**
• Deposit USDC to start trading
• Withdraw to external wallet
• View transaction history
    `.trim();

    await ctx.reply(
      walletMessage,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💵 Deposit', 'wallet_deposit')],
          [Markup.button.callback('💸 Withdraw', 'wallet_withdraw')],
          [Markup.button.callback('📋 Transactions', 'wallet_txns')],
          [Markup.button.callback('🔓 Disconnect', 'wallet_disconnect')]
        ])
      }
    );

  } catch (error) {
    console.error('Error in wallet command:', error);
    await ctx.reply('Error loading wallet. Please try again.');
  }
}

export async function handleWalletCreate(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    
    // Get or create user first
    const user = await getOrCreateUser(telegramId);
    
    // Check if user already has a wallet
    if (user.wallet_address) {
      await ctx.reply(
        '✅ **Wallet Already Exists!**\n\n' +
        `Address: \`${user.wallet_address}\`\n\n` +
        'Your wallet is ready to use.',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💵 Deposit', 'wallet_deposit')],
            [Markup.button.callback('📊 View Portfolio', 'portfolio')]
          ])
        }
      );
      return;
    }
    
    await ctx.reply('🔐 Creating your secure wallet...');
    
    // Create Privy wallet
    const { privyUserId, walletAddress, privateKey } = await createUserWallet(telegramId);

    // Update user in database (storing private key - in production this should be encrypted!)
    await supabase
      .from('telegram_users')
      .update({
        privy_user_id: privyUserId,
        wallet_address: walletAddress,
        settings: { 
          ...(user.settings || {}), 
          private_key: privateKey // TODO: Encrypt this in production!
        }
      })
      .eq('telegram_id', telegramId);

    await ctx.reply(
      '✅ **Wallet Created!**\n\n' +
      `Address: \`${walletAddress}\`\n\n` +
      'Your wallet is ready. Deposit USDC to start trading!',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💵 Deposit Now', 'wallet_deposit')]
        ])
      }
    );

  } catch (error) {
    console.error('Error creating wallet:', error);
    await ctx.reply('Failed to create wallet. Please try again.');
  }
}

export async function handleWalletDeposit(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);

    if (!user.wallet_address) {
      await ctx.reply('Please create a wallet first using /wallet');
      return;
    }

    const depositAddress = getDepositAddress(user.wallet_address);

    await ctx.reply(
      '💵 **Deposit USDC**\n\n' +
      `Send USDC (Polygon) to:\n` +
      `\`${depositAddress}\`\n\n` +
      '⚠️ **Important:**\n' +
      '• Only send USDC on Polygon network\n' +
      '• Deposits appear in ~1 minute\n' +
      '• Minimum: $1 USDC',
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Error in deposit:', error);
    await ctx.reply('Error showing deposit info. Please try again.');
  }
}

export async function handleWalletWithdraw(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);
    
    if (!user.wallet_address) {
      await ctx.reply('Please create a wallet first using /wallet');
      return;
    }

    // Get balance to show in withdraw message
    const balance = await getWalletBalance(user.wallet_address);

    await ctx.reply(
      '💸 **Withdraw USDC**\n\n' +
      `Current Balance: ${formatUSDC(balance)} USDC\n\n` +
      'To withdraw, send:\n' +
      '`/withdraw <amount> <address>`\n\n' +
      '**Example:**\n' +
      '`/withdraw 50 0x1234...5678`\n\n' +
      '⚠️ Minimum: $1 USDC\n' +
      '⏱ Processed within 5 minutes',
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Error in withdraw:', error);
    await ctx.reply('Error showing withdrawal info. Please try again.');
  }
}

export async function handleWalletTransactions(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);

    if (!user.wallet_address) {
      await ctx.reply('Please create a wallet first using /wallet');
      return;
    }

    const polygonScanUrl = `https://polygonscan.com/address/${user.wallet_address}`;

    await ctx.reply(
      '📋 **Transaction History**\n\n' +
      `View all your transactions on PolygonScan:\n` +
      `${polygonScanUrl}\n\n` +
      '✅ All deposits, withdrawals, and trades are shown there.',
      {
        parse_mode: 'Markdown',
        disable_web_page_preview: false
      }
    );

  } catch (error) {
    console.error('Error showing transactions:', error);
    await ctx.reply('Error loading transaction history. Please try again.');
  }
}

export default {
  walletCommand,
  handleWalletCreate,
  handleWalletDeposit,
  handleWalletWithdraw,
  handleWalletTransactions
};
