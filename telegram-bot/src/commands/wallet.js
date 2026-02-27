import { Markup } from 'telegraf';
import { createUserWallet, getWalletBalance, getDepositAddress } from '../services/privy.js';
import { getOrCreateUser, supabase } from '../db/supabase.js';
import { executeWithdrawalGasFree, getUsdcBalance } from '../services/relay.js';
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
          [Markup.button.callback('🔑 Export Private Key', 'wallet_export_key')],
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
    const balanceNum = parseFloat(balance);

    await ctx.reply(
      '💸 **Withdraw USDC**\n\n' +
      `Current Balance: ${formatUSDC(balance)} USDC\n\n` +
      'Choose how much to withdraw:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔢 Custom Amount', 'withdraw_custom')],
          [Markup.button.callback('💰 Withdraw All', 'withdraw_amt:all')],
          [Markup.button.callback('⬅️ Back', 'wallet_menu')]
        ])
      }
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

/**
 * Handle /withdraw command
 */
export async function withdrawCommand(ctx) {
  try {
    const text = ctx.message.text;
    const parts = text.split(/\s+/);
    
    // Format: /withdraw <amount> <address>
    if (parts.length < 3) {
      await ctx.reply(
        '❌ **Invalid Format**\n\n' +
        'Use: `/withdraw <amount> <address>`\n\n' +
        '**Example:**\n' +
        '`/withdraw 50 0x1234...5678`',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    const amount = parseFloat(parts[1]);
    const address = parts[2];
    
    // Validate amount
    if (isNaN(amount) || amount < 1) {
      await ctx.reply('❌ Invalid amount. Minimum withdrawal is $1 USDC.');
      return;
    }
    
    // Validate address (basic check)
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      await ctx.reply('❌ Invalid Ethereum address format.');
      return;
    }
    
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);
    
    if (!user.wallet_address) {
      await ctx.reply('❌ No wallet found. Create one first with /wallet');
      return;
    }
    
    // Check balance
    const balance = await getWalletBalance(user.wallet_address);
    
    if (amount > balance) {
      await ctx.reply(
        `❌ Insufficient balance\\n\\n` +
        `Requested: $${amount} USDC\\n` +
        `Available: ${formatUSDC(balance)} USDC`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    // Confirm withdrawal
    await ctx.reply(
      `🔄 **Confirm Withdrawal**\\n\\n` +
      `Amount: $${amount} USDC\\n` +
      `To: \`${address}\`\\n\\n` +
      `This will be sent on Polygon network.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Confirm', `withdraw_confirm:${amount}:${address}`),
            Markup.button.callback('❌ Cancel', 'withdraw_cancel')
          ]
        ])
      }
    );
    
  } catch (error) {
    console.error('Error in withdraw command:', error);
    await ctx.reply('❌ Error processing withdrawal. Please try again.');
  }
}

/**
 * Confirm withdrawal
 */
export async function handleWithdrawConfirm(ctx, amount, address) {
  try {
    await ctx.answerCbQuery('Processing...');
    
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);
    
    await ctx.editMessageText('⏳ Processing withdrawal...');
    
    // Get private key (in production, this should be decrypted from secure storage)
    const privateKey = user.settings?.private_key;
    
    if (!privateKey) {
      await ctx.reply('❌ Wallet private key not found. Please contact support.');
      return;
    }
    
    // Execute gas-free withdrawal via Polymarket Relayer
    console.log(`[Wallet] Executing withdrawal: $${amount} USDC to ${address}`);
    
    const result = await executeWithdrawalGasFree(privateKey, address, amount);
    
    if (!result.success) {
      await ctx.reply(
        `❌ **Withdrawal Failed**\n\nError: ${result.error}\n\nPlease try again or contact support.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    await ctx.reply(
      `✅ **Withdrawal Complete!**\n\nAmount: $${amount} USDC\nTo: \`${address}\`\n\n🔗 [View on PolygonScan](https://polygonscan.com/tx/${result.txHash})\n\n⚡ Powered by Polymarket Relayer (gas-free)`,
      { 
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }
    );
    
  } catch (error) {
    console.error('Error confirming withdrawal:', error);
    await ctx.reply('❌ Withdrawal failed. Please try again or contact support.');
  }
}

/**
 * Cancel withdrawal
 */
export async function handleWithdrawCancel(ctx) {
  try {
    await ctx.answerCbQuery('Cancelled');
    await ctx.editMessageText('❌ Withdrawal cancelled.');
  } catch (error) {
    console.error('Error cancelling withdrawal:', error);
  }
}

/**
 * Handle withdraw amount selection
 */
export async function handleWithdrawAmount(ctx, amount) {
  try {
    await ctx.answerCbQuery();
    
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);
    
    if (!user.wallet_address) {
      await ctx.reply('Please create a wallet first using /wallet');
      return;
    }
    
    // Get balance
    const balance = await getWalletBalance(user.wallet_address);
    
    // Handle "all" amount
    let withdrawAmount = amount;
    if (amount === 'all') {
      withdrawAmount = balance;
    } else {
      withdrawAmount = parseFloat(amount);
    }
    
    // Check balance
    if (withdrawAmount > parseFloat(balance)) {
      await ctx.reply(
        `❌ Insufficient balance\\n\\nRequested: $${withdrawAmount}\\nAvailable: ${formatUSDC(balance)}`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    // Store the amount and wallet address in session
    ctx.session = ctx.session || {};
    ctx.session.withdrawAmount = withdrawAmount;
    ctx.session.walletAddress = user.wallet_address;
    
    // Ask for address
    await ctx.reply(
      `💸 **Withdraw $${withdrawAmount} USDC**\\n\\n` +
      'Please paste your external wallet address:\\n\\n' +
      '⚠️ Make sure it\'s an Ethereum/Polygon address',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancel', 'wallet_menu')]
        ])
      }
    );
    
    // Set up next handler for address input
    // The user will reply with their address
    
  } catch (error) {
    console.error('Error handling withdraw amount:', error);
    await ctx.reply('Error. Please try again.');
  }
}

/**
 * Handle withdraw address input (called from message handler)
 */
export async function handleWithdrawAddress(ctx, address, amount) {
  try {
    // Validate address
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      await ctx.reply(
        '❌ Invalid address. Please paste a valid Ethereum/Polygon address (0x...)',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);
    
    if (!user.wallet_address) {
      await ctx.reply('Please create a wallet first using /wallet');
      return;
    }
    
    // Get private key
    const privateKey = user.settings?.private_key;
    
    if (!privateKey) {
      await ctx.reply('❌ Wallet error. Please contact support.');
      return;
    }
    
    // Execute gas-free withdrawal
    await ctx.reply('⏳ Processing withdrawal...');
    
    console.log(`[Wallet] Executing withdrawal: $${amount} USDC to ${address}`);
    
    const result = await executeWithdrawalGasFree(privateKey, address, amount);
    
    if (!result.success) {
      await ctx.reply(
        `❌ **Withdrawal Failed**\\n\\nError: ${result.error}`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    await ctx.reply(
      `✅ **Withdrawal Complete!**\\n\\nAmount: $${amount} USDC\\nTo: \`${address}\`\\n\\n🔗 [View on PolygonScan](https://polygonscan.com/tx/${result.txHash})\\n\\n⚡ Gas-free via Polymarket Relayer`,
      { 
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }
    );
    
  } catch (error) {
    console.error('Error processing withdraw address:', error);
    await ctx.reply('❌ Error processing withdrawal. Please try again.');
  }
}

/**
 * Handle custom amount button - ask for amount input
 */
export async function handleWithdrawCustom(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);
    
    if (!user.wallet_address) {
      await ctx.reply('Please create a wallet first using /wallet');
      return;
    }
    
    // Set session to wait for amount input
    ctx.session = ctx.session || {};
    ctx.session.waitingWithdrawAmount = true;
    ctx.session.walletAddress = user.wallet_address;
    
    const balance = await getWalletBalance(user.wallet_address);
    
    await ctx.reply(
      `💸 **Withdraw USDC**\\n\\n` +
      `Available: ${formatUSDC(balance)} USDC\\n\\n` +
      'Please enter the amount you want to withdraw (just the number):\\n\\n' +
      'Example: `25` for $25',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancel', 'wallet_menu')]
        ])
      }
    );
    
  } catch (error) {
    console.error('Error in withdraw custom:', error);
    await ctx.reply('Error. Please try again.');
  }
}

/**
 * Export private key - gives user full control of their wallet
 */
export async function handleWalletExportKey(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const telegramId = ctx.from.id;
    const user = await getOrCreateUser(telegramId);
    
    if (!user.wallet_address) {
      await ctx.reply('Please create a wallet first using /wallet');
      return;
    }
    
    const privateKey = user.settings?.private_key;
    
    if (!privateKey) {
      await ctx.reply('❌ Private key not found. Please contact support.');
      return;
    }
    
    await ctx.reply(
      '🔑 **Export Private Key**\\n\\n' +
      '⚠️ **WARNING: Never share this key!**\\n\\n' +
      'Anyone with this key has full control of your wallet and funds.\\n\\n' +
      'With this key you can:\\n' +
      '• Import your wallet into MetaMask\\n' +
      '• Export funds even if our service goes down\\n' +
      '• Have complete control of your assets\\n\\n' +
      'Your private key:\\n' +
      `\`${privateKey}\``,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ Back to Wallet', 'wallet_menu')]
        ])
      }
    );
    
  } catch (error) {
    console.error('Error exporting key:', error);
    await ctx.reply('Error. Please try again.');
  }
}
