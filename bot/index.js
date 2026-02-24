const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const userDb = require('./db');
const stripe = require('./stripe');
const { createClient } = require('@supabase/supabase-js');

// ── Supabase (for Pro status sync) ──────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  console.log('[SUPABASE] Connected for Pro sync');
} else {
  console.log('[SUPABASE] No credentials — Pro sync disabled');
}

/**
 * Fetch Pro wallet addresses from Supabase and sync to SQLite.
 * Called before each broadcast to ensure is_pro is up-to-date.
 */
async function syncProStatus() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('ep_users')
      .select('wallet_address')
      .neq('subscription_tier', 'free')
      .in('subscription_status', ['active', 'trialing']);

    if (error) {
      console.log(`[SUPABASE] Sync error: ${error.message}`);
      return;
    }

    const proWallets = new Set(
      (data || []).map(u => (u.wallet_address || '').toLowerCase())
    );

    const { promoted, demoted, promotedUserIds } = userDb.syncProFromSupabase(proWallets);
    console.log(`[SUPABASE] Pro sync: ${proWallets.size} Pro wallets, ${promoted} promoted, ${demoted} demoted`);

    // Send welcome DM to newly promoted Pro users who don't have a trading wallet
    for (const userId of promotedUserIds) {
      try {
        const hasKey = userDb.getPrivateKey(userId);
        if (!hasKey) {
          await bot.sendMessage(userId,
            `🎉 *Welcome to EasyPoly Pro!*\n\n` +
            `Your subscription is active! You'll now receive AI picks with BET buttons.\n\n` +
            `⚡ *One quick setup:* Create a trading wallet so the bot can place bets for you. Takes ~30 seconds.\n\n` +
            `🆕 *Create Wallet* — We generate a fresh wallet. Fund with USDC on Polygon.\n` +
            `🔑 *Import Key* — Use your existing Polymarket private key`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🆕 Create Trading Wallet', callback_data: 'SETUP_CREATE' }],
                  [{ text: '🔑 Import Private Key', callback_data: 'SETUP_IMPORT' }]
                ]
              }
            }
          );
          console.log(`[PRO] Sent wallet setup DM to newly promoted user ${userId}`);
        } else {
          await bot.sendMessage(userId,
            `🎉 *Welcome to EasyPoly Pro!*\n\n` +
            `Your subscription is active and your trading wallet is ready!\n` +
            `You'll receive AI picks with BET buttons starting now. 🚀`,
            { parse_mode: 'Markdown' }
          );
          console.log(`[PRO] Sent Pro welcome to user ${userId} (wallet ready)`);
        }
      } catch (err) {
        console.log(`[PRO] Failed to send welcome DM to ${userId}: ${err.message}`);
      }
    }
  } catch (err) {
    console.log(`[SUPABASE] Sync failed: ${err.message}`);
  }
}

// ── Config ──────────────────────────────────────────────────
const BOT_VERSION = '2.0.0'; // 2026-02-12 21:25
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_SECRET = process.env.API_SECRET || 'easypoly-2026';
// Local trader via ngrok (Norway IP - Polymarket blocks Railway IPs)
// Cloudflare Tunnel to local Mac mini trader (bypasses Polymarket geo-block on Railway)
const TRADER_URL = process.env.TRADER_URL || 'https://easypoly.ngrok.pizza';
const TRADER_KEY = process.env.TRADER_KEY || 'pm-trader-erik-2026';
const PORT = process.env.PORT || 3000;
const FREE_PICKS = 5;

// Legacy JSON DB for picks/actions (keep backward compat)
const DB_PATH = '/data/easypoly.json';

process.on('unhandledRejection', (err) => {
  console.error('🔴 Unhandled Rejection:', err?.message || err);
  console.error('Stack:', err?.stack);
});

process.on('uncaughtException', (err) => {
  console.error('🔴 Uncaught Exception:', err?.message || err);
  console.error('Stack:', err?.stack);
});

console.log('🎯 EasyPoly Bot starting...');
console.log(`   BOT_TOKEN: ${BOT_TOKEN ? BOT_TOKEN.substring(0, 10) + '...' : 'MISSING'}`);
console.log(`   TRADER_URL: ${TRADER_URL}`);
console.log(`   PORT: ${PORT}`);

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is required!');
  process.exit(1);
}

// ── Legacy JSON store (picks + actions only) ────────────────
function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) { console.log('DB load error, starting fresh:', e.message); }
  return { users: {}, picks: {}, actions: [] };
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) { console.log('DB save error:', e.message); }
}

const db = loadDB();

// Migrate legacy JSON users to SQLite
if (db.users && Object.keys(db.users).length > 0) {
  try {
    userDb.migrateFromJson(db.users);
    console.log(`📦 Migrated ${Object.keys(db.users).length} users from JSON to SQLite`);
  } catch (e) { console.log('Migration note:', e.message); }
}

// Init Stripe price on startup
stripe.getOrCreatePrice().then(id => console.log(`💳 Stripe price ready: ${id}`)).catch(e => console.log('Stripe init:', e.message));

// ── Bot ─────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on('polling_error', (err) => {
  console.error('Polling error:', err.code, err.message);
});

// Set command menu (shows when user types /)
bot.setMyCommands([
  { command: 'start', description: '🚀 Subscribe to AI picks' },
  { command: 'positions', description: '📊 Live portfolio + SELL buttons' },
  { command: 'orders', description: '📋 Pending orders' },
  { command: 'pnl', description: '💰 Lifetime profit & loss' },
  { command: 'history', description: '📜 Recent trades' },
  { command: 'leaderboard', description: '🏆 Top traders ranking' },
  { command: 'connect', description: '🔗 Connect your wallet' },
  { command: 'wallet', description: '👛 Wallet details' },
  { command: 'stats', description: '📈 Your betting stats' },
  { command: 'stop', description: '🔕 Unsubscribe from picks' },
]).then(() => console.log('📋 Command menu set')).catch(e => console.log('Menu error:', e.message));

console.log('📱 Telegram polling started');

const WELCOME_LANDING_URL = process.env.WELCOME_LANDING_URL || 'https://easypoly.lol';

const WELCOME = `🎯 *Welcome to EasyPoly!*

AI-curated Polymarket picks, delivered straight to you.

No more scanning hundreds of markets — we did it for you.

📊 We analyze markets 3x daily (8 AM, 2 PM, 6 PM)
🤖 AI identifies the best opportunities  
📱 You get picks with one-tap BET or SKIP

*100% FREE* during beta — prove it works, then we monetize.

Ready to start? Just hit /start and you'll receive picks automatically.

/start - Subscribe to picks
/positions - Portfolio + SELL buttons
/orders - Pending orders
/pnl - Profit & loss
/history - Recent trades
/leaderboard - Rankings
/help - All commands`;

// Track users in /connect flow (waiting for credentials)
const connectFlow = {};

bot.onText(/\/start(.*)/, async (msg, match) => {
  try {
    const chatId = String(msg.chat.id);
    const startParam = (match && match[1]) ? match[1].trim() : '';
    userDb.upsertUser(chatId, msg.chat.username, msg.chat.first_name);
    userDb.setSubscribed(chatId, true);

    // Deep link: /start setup_wallet — go straight to wallet creation (from website post-payment)
    if (startParam === 'setup_wallet') {
      // Check if they already have a full trading wallet
      const existingKey = userDb.getPrivateKey(chatId);
      if (existingKey) {
        await bot.sendMessage(chatId,
          `✅ *Trading Wallet Ready!*\n\n` +
          `You already have a trading wallet set up. You're all set to receive picks with BET buttons!\n\n` +
          `Use /wallet to view details.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      await bot.sendMessage(chatId,
        `🎉 *Welcome to Pro!*\n\n` +
        `One last step — create a trading wallet so the bot can place bets for you.\n\n` +
        `🆕 *Create Wallet* — We generate a fresh wallet. Fund it with USDC on Polygon and start betting!\n` +
        `🔑 *Import Key* — Use your existing Polymarket private key\n\n` +
        `⏱️ Takes about 30 seconds.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🆕 Create Trading Wallet', callback_data: 'SETUP_CREATE' }],
              [{ text: '🔑 Import Private Key', callback_data: 'SETUP_IMPORT' }]
            ]
          }
        }
      );
      return;
    }

    // Check if user already has wallet connected
    if (userDb.hasPolyCredentials(chatId)) {
      await bot.sendMessage(chatId,
        `🎯 *Welcome back!*\n\n` +
        `✅ Your wallet is connected\n` +
        `📊 You'll receive AI picks 3x daily (8 AM, 2 PM, 6 PM)\n\n` +
        `Commands:\n` +
        `/status - Account info\n` +
        `/wallet - Wallet details\n` +
        `/stats - Your betting history\n` +
        `/disconnect - Remove wallet`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Clean up old demo picks (older than 7 days)
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    Object.keys(db.picks).forEach(pickId => {
      if (pickId.startsWith('demo-') && db.picks[pickId].createdAt) {
        const createdAt = new Date(db.picks[pickId].createdAt).getTime();
        if (createdAt < sevenDaysAgo) {
          delete db.picks[pickId];
        }
      }
    });
    saveDB(db);

    // New user - send welcome + DEMO PICK immediately
    await bot.sendMessage(chatId,
      `🎯 *Welcome to EasyPoly!*\n\n` +
      `AI-curated Polymarket picks delivered 3x daily.\n\n` +
      `Here's what you'll receive:`,
      { parse_mode: 'Markdown' }
    );

    // Send demo pick
    const demoPickId = 'demo-' + Date.now();

    // Save demo pick to database so it can be looked up when user clicks BET
    db.picks[demoPickId] = {
      question: 'Will Bitcoin hit $150k before July 2026?',
      side: 'YES',
      price: 0.38,
      confidence: 'High',
      reasoning: 'On-chain metrics show institutional accumulation pattern similar to pre-$100k breakout. ETF inflows accelerating. Market significantly underpricing this outcome.',
      tokenId: 'demo-token-id',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      isDemo: true
    };
    saveDB(db);

    const conf = '🔥';
    const text = `${conf} <b>DEMO PICK</b>\n\n` +
      `<b>Will Bitcoin hit $150k before July 2026?</b>\n\n` +
      `📈 Side: <b>YES</b>\n` +
      `💰 Market Price: <b>38¢</b>\n` +
      `🎯 Our Estimate: <b>62%</b>\n` +
      `📊 Edge: <b>+24%</b>\n\n` +
      `💡 <i>On-chain metrics show institutional accumulation similar to pre-$100k breakout. ETF inflows accelerating. Market significantly underpricing this outcome.</i>\n\n` +
      `👇 Tap below to place bet:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🎯 $5', callback_data: `BET:${demoPickId}:5` },
          { text: '💰 $10', callback_data: `BET:${demoPickId}:10` },
          { text: '🔥 $25', callback_data: `BET:${demoPickId}:25` },
        ],
        [
          { text: '⏭️ SKIP', callback_data: `SKIP:${demoPickId}` }
        ]
      ]
    };

    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });

    await bot.sendMessage(chatId,
      `💡 *Like what you see?*\n\n` +
      `Connect your wallet to start placing bets from real picks.\n` +
      `Your funds stay in YOUR Polymarket account — we never hold your money.`,
      { parse_mode: 'Markdown' }
    );

    await bot.sendMessage(chatId,
      `🔗 *Set Up Your Wallet*\n\n` +
      `Choose how you want to trade:\n\n` +
      `🆕 *Create Wallet* — We generate a fresh wallet for you. Fund it with USDC and start betting!\n` +
      `🔑 *Import Key* — Paste your existing Polymarket private key`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🆕 Create Trading Wallet', callback_data: 'SETUP_CREATE' }],
            [{ text: '🔑 Import Private Key', callback_data: 'SETUP_IMPORT' }]
          ]
        }
      }
    );

    const total = userDb.getActiveUsers().length;
    console.log(`[+] ${msg.chat.first_name || msg.chat.username || chatId} subscribed (total: ${total})`);
  } catch (err) {
    console.error('[/start] Error:', err.message, err.stack);
  }
});

bot.onText(/\/stop/, (msg) => {
  const chatId = String(msg.chat.id);
  userDb.setSubscribed(chatId, false);
  bot.sendMessage(chatId, '👋 Unsubscribed. /start to come back anytime.');
});

bot.onText(/\/stats/, (msg) => {
  const chatId = String(msg.chat.id);
  const myActions = db.actions.filter(a => a.chatId === chatId);
  const bets = myActions.filter(a => a.action === 'BET').length;
  const skips = myActions.filter(a => a.action === 'SKIP').length;
  
  let text = `📊 *Your Stats*\n\n🎯 Bets: ${bets}\n⏭️ Skips: ${skips}`;
  if (myActions.length) {
    text += '\n\n*Recent:*\n';
    myActions.slice(-10).reverse().forEach(a => {
      text += `${a.action === 'BET' ? '✅' : '⏭️'} ${a.action} — ${(a.question || '').substring(0, 50)}...\n`;
    });
  }
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// ── /status command ─────────────────────────────────────────
bot.onText(/\/status/, (msg) => {
  const chatId = String(msg.chat.id);
  const user = userDb.getUser(chatId);
  if (!user) {
    bot.sendMessage(chatId, '❓ Not found. Send /start first.');
    return;
  }
  const picks = user.picks_received || 0;
  const text = `📊 *Your Account*\n\n📬 Picks received: ${picks}\n🆓 Unlimited picks (beta)\n\nEnjoy EasyPoly!`;
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// ── /subscribe command ──────────────────────────────────────
bot.onText(/\/subscribe/, async (msg) => {
  const chatId = String(msg.chat.id);
  const user = userDb.getUser(chatId);
  if (user?.is_pro) {
    bot.sendMessage(chatId, '✅ You\'re already a Pro member! Enjoy unlimited picks.');
    return;
  }
  try {
    const session = await stripe.createCheckoutSession(chatId);
    if (session.error) {
      bot.sendMessage(chatId, `❌ Error: ${session.error.message}`);
      return;
    }
    bot.sendMessage(chatId, `🚀 *Upgrade to EasyPoly Pro*\n\n💰 $9/month — unlimited AI picks\n\nTap below to subscribe:`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '💳 Subscribe — $9/mo', url: session.url }]]
      }
    });
  } catch (err) {
    console.error('Subscribe error:', err.message);
    bot.sendMessage(chatId, '❌ Something went wrong. Try again later.');
  }
});

// ── /connect command — wallet setup ─────────────────────────
bot.onText(/\/connect/, (msg) => {
  const chatId = String(msg.chat.id);

  // Only allow in private chat
  if (msg.chat.type !== 'private') {
    bot.sendMessage(chatId, '🔒 For security, /connect only works in private chat. DM me directly!');
    return;
  }

  userDb.upsertUser(chatId, msg.chat.username, msg.chat.first_name);

  if (userDb.hasPolyCredentials(chatId)) {
    const hasKey = !!userDb.getPrivateKey(chatId);
    if (hasKey) {
      bot.sendMessage(chatId, '✅ You already have a wallet connected and ready to trade!\n\nUse /disconnect to remove it, or /wallet to check status.');
    } else {
      // MetaMask-only user — nudge them to create a trading wallet
      bot.sendMessage(chatId,
        `⚠️ *Wallet Connected (View Only)*\n\n` +
        `Your MetaMask wallet is linked, but bets require a *trading wallet* so we can sign orders on your behalf.\n\n` +
        `Choose an option below to enable betting:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🆕 Create Trading Wallet', callback_data: 'SETUP_CREATE' }],
              [{ text: '🔑 Import Private Key', callback_data: 'SETUP_IMPORT' }],
              [{ text: '🗑️ Disconnect', callback_data: 'SETUP_DISCONNECT' }]
            ]
          }
        }
      );
    }
    return;
  }

  bot.sendMessage(chatId,
    `🔗 *Connect Your Wallet*\n\n` +
    `Choose how you want to trade on Polymarket:\n\n` +
    `🆕 *Create Wallet* — We generate a fresh wallet for you. Easiest option!\n` +
    `🔑 *Import Key* — Paste your existing Polymarket private key\n` +
    `🌐 *Browser Connect* — Link via MetaMask/Rabby (view-only, can't auto-bet)`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🆕 Create Trading Wallet (Recommended)', callback_data: 'SETUP_CREATE' }],
          [{ text: '🔑 Import Private Key', callback_data: 'SETUP_IMPORT' }],
          [{ text: '🌐 Browser Wallet', url: `${WELCOME_LANDING_URL}/connect?userId=${chatId}` }]
        ]
      }
    }
  );
});

// ── /disconnect command ─────────────────────────────────────
bot.onText(/\/disconnect/, (msg) => {
  const chatId = String(msg.chat.id);
  if (!userDb.hasPolyCredentials(chatId)) {
    bot.sendMessage(chatId, '❓ No wallet connected. Use /connect to set one up.');
    return;
  }
  userDb.clearPolyCredentials(chatId);
  bot.sendMessage(chatId, '🗑️ Wallet disconnected. Your API credentials have been removed.\n\nUse /connect to reconnect anytime.');
});

// ── /wallet command ─────────────────────────────────────────
bot.onText(/\/wallet/, (msg) => {
  const chatId = String(msg.chat.id);
  if (userDb.hasPolyCredentials(chatId)) {
    const creds = userDb.getPolyCredentials(chatId);
    const maskedKey = creds.apiKey ? creds.apiKey.substring(0, 8) + '...' : 'unknown';
    const hasPrivateKey = !!userDb.getPrivateKey(chatId);
    
    bot.sendMessage(chatId,
      `✅ *Polymarket Wallet Connected*\n\n` +
      `🔑 API Key: \`${maskedKey}\`\n` +
      `${creds.walletAddress ? `👛 Wallet: \`${creds.walletAddress.substring(0, 10)}...${creds.walletAddress.substring(creds.walletAddress.length - 6)}\`` : ''}\n\n` +
      `All bets will be placed in YOUR account.\n\n` +
      `${hasPrivateKey ? '🔐 /export to reveal private key\n' : ''}` +
      `/disconnect to remove credentials`,
      { parse_mode: 'Markdown' }
    );
  } else {
    bot.sendMessage(chatId,
      `❌ *No Wallet Connected*\n\nSend /start to connect your wallet.`,
      { parse_mode: 'Markdown' }
    );
  }
});

// ── /orders command — pending orders ────────────────────────
bot.onText(/\/orders/, async (msg) => {
  const chatId = String(msg.chat.id);
  
  try {
    bot.sendMessage(chatId, '🔄 Checking open orders...');
    
    const resp = await fetch(`${TRADER_URL}/balance`, {
      headers: { 'x-api-key': TRADER_KEY, 'ngrok-skip-browser-warning': '1' }
    });
    const data = await resp.json();
    
    if (!data.orders || data.orders.length === 0) {
      bot.sendMessage(chatId, '📭 No pending orders.\n\nOrders appear here after you tap BET on a pick.');
      return;
    }

    let text = `📋 *Open Orders* (${data.orders.length})\n\n`;
    
    for (const order of data.orders) {
      const side = order.side || 'BUY';
      const price = parseFloat(order.price || 0);
      const size = parseFloat(order.size || 0);
      const filled = parseFloat(order.filled || 0);
      const cost = (price * size).toFixed(2);
      const fillPct = size > 0 ? ((filled / size) * 100).toFixed(0) : 0;
      
      text += `${side === 'BUY' ? '🟢' : '🔴'} *${side}* ${size.toFixed(1)} shares @ ${(price * 100).toFixed(0)}¢\n`;
      text += `   💵 $${cost} | Filled: ${fillPct}%\n`;
      text += `   ID: \`${order.id.substring(0, 16)}...\`\n\n`;
    }
    
    text += `_Orders fill when a counterparty matches your price._`;
    
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[ORDERS]', err.message);
    bot.sendMessage(chatId, `❌ Error: ${err.message}`);
  }
});

// ── /help command ───────────────────────────────────────────
bot.onText(/\/help/, (msg) => {
  const chatId = String(msg.chat.id);
  bot.sendMessage(chatId,
    `📖 *EasyPoly Commands*\n\n` +
    `*Trading:*\n` +
    `/positions — Live portfolio + SELL buttons\n` +
    `/orders — Pending (unfilled) orders\n` +
    `/pnl — Lifetime profit & loss\n` +
    `/history — Recent trades\n` +
    `/leaderboard — Top traders ranking\n\n` +
    `*Account:*\n` +
    `/connect — Connect your Polygon wallet\n` +
    `/wallet — Wallet details\n` +
    `/stats — Betting stats\n` +
    `/export — Export private key\n\n` +
    `*Picks:*\n` +
    `/start — Subscribe to AI picks\n` +
    `/stop — Unsubscribe\n\n` +
    `_AI picks delivered 3x daily (9AM, 2PM, 7PM Oslo)_\n` +
    `_Tap BET to place instantly, SKIP to pass_`,
    { parse_mode: 'Markdown' }
  );
});

// ── /export command ─────────────────────────────────────────
bot.onText(/\/export/, (msg) => {
  const chatId = String(msg.chat.id);

  // Only allow in private chat
  if (msg.chat.type !== 'private') {
    bot.sendMessage(chatId, '🔒 For security, /export only works in private chat. DM me directly!');
    return;
  }

  const privateKey = userDb.getPrivateKey(chatId);
  if (!privateKey) {
    bot.sendMessage(chatId, '❌ No private key found.\n\nYou either:\n• Connected via API credentials (no private key stored)\n• Haven\'t set up a wallet yet\n\nUse /start to generate a new wallet.');
    return;
  }

  bot.sendMessage(chatId,
    `🔐 *Your Private Key*\n\n` +
    `\`${privateKey}\`\n\n` +
    `⚠️ *KEEP THIS SAFE!*\n` +
    `• Never share it with anyone\n` +
    `• Import it to MetaMask or any Polygon wallet\n` +
    `• Losing it means losing access to your funds\n\n` +
    `Delete this message after saving it securely.`,
    { parse_mode: 'Markdown' }
  );
});

// ── /positions command — live positions with SELL buttons ───
bot.onText(/\/positions/, async (msg) => {
  const chatId = String(msg.chat.id);
  const creds = userDb.getPolyCredentials(chatId);
  
  if (!creds || !creds.walletAddress) {
    bot.sendMessage(chatId, '❌ No wallet connected. Use /connect first.');
    return;
  }

  try {
    bot.sendMessage(chatId, '🔄 Loading positions...');
    
    // Check user's personal wallet AND shared EasyPoly wallet
    const SHARED_WALLET = '0xE73f2BDa06ee3A913A344139a074D319e7e6a32F';
    const wallets = [creds.walletAddress, SHARED_WALLET].filter(Boolean);
    
    let positions = [];
    for (const wallet of [...new Set(wallets)]) {
      const response = await fetch(`https://data-api.polymarket.com/positions?user=${wallet}&sizeThreshold=0.1&limit=50`);
      const data = await response.json();
      if (data && Array.isArray(data)) {
        // Tag positions with wallet source
        const isShared = wallet.toLowerCase() === SHARED_WALLET.toLowerCase();
        data.forEach(p => p._wallet = isShared ? 'EasyPoly' : 'Personal');
        positions.push(...data);
      }
    }
    
    if (!positions || positions.length === 0) {
      bot.sendMessage(chatId, '📭 No open positions found.\n\nYour positions will appear here after placing bets.');
      return;
    }

    // Group by market and show each position
    let totalValue = 0;
    let totalCost = 0;

    for (const pos of positions.slice(0, 10)) { // Max 10 positions shown
      const size = parseFloat(pos.size || 0);
      const avgPrice = parseFloat(pos.avgPrice || pos.initialPrice || 0);
      const curPrice = parseFloat(pos.curPrice || pos.currentPrice || avgPrice);
      const cost = size * avgPrice;
      const value = size * curPrice;
      const pnl = value - cost;
      const pnlPct = cost > 0 ? ((pnl / cost) * 100) : 0;
      
      totalValue += value;
      totalCost += cost;

      const pnlEmoji = pnl >= 0 ? '🟢' : '🔴';
      const pnlSign = pnl >= 0 ? '+' : '';
      const outcome = pos.outcome || pos.asset || 'YES';
      const title = (pos.title || pos.market || pos.question || 'Unknown Market').substring(0, 60);
      
      const walletTag = pos._wallet === 'EasyPoly' ? ' 🤖' : ' 👛';
      const text = `${pnlEmoji} *${title}*${walletTag}\n` +
        `${outcome} — ${size.toFixed(1)} shares\n` +
        `Entry: ${(avgPrice * 100).toFixed(1)}¢ → Now: ${(curPrice * 100).toFixed(1)}¢\n` +
        `P&L: ${pnlSign}$${pnl.toFixed(2)} (${pnlSign}${pnlPct.toFixed(1)}%)`;

      // SELL button — store full data in memory, use short key in callback
      const tokenId = pos.asset || pos.tokenId || pos.conditionId;
      const sellKey = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
      if (!global._sellCache) global._sellCache = {};
      global._sellCache[sellKey] = { tokenId, shares: size, outcome };
      // Auto-expire after 1 hour
      setTimeout(() => { if (global._sellCache) delete global._sellCache[sellKey]; }, 3600000);
      
      bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: `💰 SELL ${size.toFixed(1)} shares`, callback_data: `SELL:${sellKey}` },
              { text: '📊 Details', url: `https://polymarket.com/event/${pos.conditionId || pos.marketSlug || ''}` }
            ]
          ]
        }
      });
    }

    // Summary
    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? ((totalPnl / totalCost) * 100) : 0;
    const summaryEmoji = totalPnl >= 0 ? '🟢' : '🔴';
    
    bot.sendMessage(chatId, 
      `\n${summaryEmoji} *Portfolio Summary*\n\n` +
      `💰 Total Value: $${totalValue.toFixed(2)}\n` +
      `📈 Total P&L: ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)} (${totalPnl >= 0 ? '+' : ''}${totalPnlPct.toFixed(1)}%)\n` +
      `📊 Positions: ${positions.length}`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[POSITIONS]', err.message);
    bot.sendMessage(chatId, `❌ Error loading positions: ${err.message}`);
  }
});

// ── /pnl command — lifetime profit/loss ─────────────────────
bot.onText(/\/pnl/, async (msg) => {
  const chatId = String(msg.chat.id);
  const creds = userDb.getPolyCredentials(chatId);
  
  if (!creds || !creds.walletAddress) {
    bot.sendMessage(chatId, '❌ No wallet connected. Use /connect first.');
    return;
  }

  try {
    bot.sendMessage(chatId, '🔄 Calculating P&L...');
    
    // Fetch positions from personal + shared wallet
    const SHARED_WALLET_PNL = '0xE73f2BDa06ee3A913A344139a074D319e7e6a32F';
    const pnlWallets = [...new Set([creds.walletAddress, SHARED_WALLET_PNL].filter(Boolean))];
    
    let openPositions = [];
    let closedPositions = [];
    for (const w of pnlWallets) {
      const [oRes, cRes] = await Promise.all([
        fetch(`https://data-api.polymarket.com/positions?user=${w}&sizeThreshold=0.1&limit=100`),
        fetch(`https://data-api.polymarket.com/positions?user=${w}&sizeThreshold=0&limit=100&status=closed`)
      ]);
      const oData = await oRes.json();
      const cData = await cRes.json();
      if (Array.isArray(oData)) openPositions.push(...oData);
      if (Array.isArray(cData)) closedPositions.push(...cData);
    }
    
    let openPnl = 0, openValue = 0, openCost = 0;
    let closedPnl = 0, wins = 0, losses = 0;
    let bestTrade = { pnl: -Infinity, title: '' };
    let worstTrade = { pnl: Infinity, title: '' };

    // Calculate open P&L
    for (const pos of (openPositions || [])) {
      const size = parseFloat(pos.size || 0);
      const avg = parseFloat(pos.avgPrice || pos.initialPrice || 0);
      const cur = parseFloat(pos.curPrice || pos.currentPrice || avg);
      const cost = size * avg;
      const val = size * cur;
      openCost += cost;
      openValue += val;
      openPnl += (val - cost);
    }

    // Calculate closed P&L
    for (const pos of (closedPositions || [])) {
      const size = parseFloat(pos.size || 0);
      const avg = parseFloat(pos.avgPrice || pos.initialPrice || 0);
      const cur = parseFloat(pos.curPrice || pos.currentPrice || 0);
      const pnl = (cur - avg) * size;
      closedPnl += pnl;
      
      if (pnl >= 0) wins++;
      else losses++;
      
      const title = (pos.title || pos.market || 'Unknown').substring(0, 40);
      if (pnl > bestTrade.pnl) bestTrade = { pnl, title };
      if (pnl < worstTrade.pnl) worstTrade = { pnl, title };
    }

    const totalPnl = openPnl + closedPnl;
    const totalTrades = wins + losses + (openPositions?.length || 0);
    const winRate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100) : 0;

    const emoji = totalPnl >= 0 ? '🟢' : '🔴';
    const sign = totalPnl >= 0 ? '+' : '';

    let text = `${emoji} *Lifetime P&L*\n\n` +
      `💰 Total: ${sign}$${totalPnl.toFixed(2)}\n` +
      `📊 Open P&L: ${openPnl >= 0 ? '+' : ''}$${openPnl.toFixed(2)}\n` +
      `✅ Closed P&L: ${closedPnl >= 0 ? '+' : ''}$${closedPnl.toFixed(2)}\n\n` +
      `📈 Win Rate: ${winRate.toFixed(0)}% (${wins}W / ${losses}L)\n` +
      `🔢 Total Trades: ${totalTrades}\n` +
      `📭 Open Positions: ${openPositions?.length || 0}`;

    if (bestTrade.pnl > -Infinity) {
      text += `\n\n🏆 Best: +$${bestTrade.pnl.toFixed(2)} — ${bestTrade.title}`;
    }
    if (worstTrade.pnl < Infinity) {
      text += `\n💀 Worst: $${worstTrade.pnl.toFixed(2)} — ${worstTrade.title}`;
    }

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[PNL]', err.message);
    bot.sendMessage(chatId, `❌ Error: ${err.message}`);
  }
});

// ── /history command — recent trades ────────────────────────
bot.onText(/\/history/, async (msg) => {
  const chatId = String(msg.chat.id);
  const creds = userDb.getPolyCredentials(chatId);
  
  if (!creds || !creds.walletAddress) {
    bot.sendMessage(chatId, '❌ No wallet connected. Use /connect first.');
    return;
  }

  try {
    // Fetch recent positions from personal + shared wallet
    const SHARED_WALLET_HIST = '0xE73f2BDa06ee3A913A344139a074D319e7e6a32F';
    const histWallets = [...new Set([creds.walletAddress, SHARED_WALLET_HIST].filter(Boolean))];
    let positions = [];
    for (const w of histWallets) {
      const res = await fetch(`https://data-api.polymarket.com/positions?user=${w}&limit=15`);
      const data = await res.json();
      if (Array.isArray(data)) positions.push(...data);
    }
    
    if (!positions || positions.length === 0) {
      bot.sendMessage(chatId, '📭 No trade history yet. Place some bets first!');
      return;
    }

    let text = '📜 *Recent Trades*\n\n';
    
    for (const pos of positions.slice(0, 10)) {
      const size = parseFloat(pos.size || 0);
      const avg = parseFloat(pos.avgPrice || pos.initialPrice || 0);
      const cur = parseFloat(pos.curPrice || pos.currentPrice || avg);
      const pnl = (cur - avg) * size;
      const resolved = pos.resolved || pos.status === 'closed';
      
      let status;
      if (resolved) {
        status = pnl >= 0 ? '✅ WON' : '❌ LOST';
      } else {
        status = '⏳ OPEN';
      }
      
      const title = (pos.title || pos.market || pos.question || 'Unknown').substring(0, 45);
      const outcome = pos.outcome || pos.asset || 'YES';
      
      text += `${status} *${title}*\n`;
      text += `   ${outcome} ${size.toFixed(1)} @ ${avg.toFixed(2)}¢ → ${cur.toFixed(2)}¢ | ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}\n\n`;
    }

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[HISTORY]', err.message);
    bot.sendMessage(chatId, `❌ Error: ${err.message}`);
  }
});

// ── /leaderboard command — anonymous ranking ────────────────
bot.onText(/\/leaderboard/, async (msg) => {
  const chatId = String(msg.chat.id);
  
  // Get all users with wallets
  const allUsers = userDb.getAllUsers().filter(u => u.poly_wallet_address);
  
  if (allUsers.length < 2) {
    bot.sendMessage(chatId, '🏆 Leaderboard coming soon! Need more users with connected wallets.');
    return;
  }

  try {
    bot.sendMessage(chatId, '🔄 Loading leaderboard...');
    
    // Fetch P&L for each user
    const leaderboard = [];
    for (const user of allUsers) {
      try {
        const res = await fetch(`https://data-api.polymarket.com/positions?user=${user.poly_wallet_address}&sizeThreshold=0&limit=100`);
        const positions = await res.json();
        
        let pnl = 0;
        for (const pos of (positions || [])) {
          const size = parseFloat(pos.size || 0);
          const avg = parseFloat(pos.avgPrice || pos.initialPrice || 0);
          const cur = parseFloat(pos.curPrice || pos.currentPrice || avg);
          pnl += (cur - avg) * size;
        }
        
        leaderboard.push({
          userId: user.user_id,
          name: user.first_name || user.username || `User ${user.user_id.slice(-4)}`,
          pnl,
          trades: positions?.length || 0
        });
      } catch (e) {
        // Skip users with errors
      }
    }

    leaderboard.sort((a, b) => b.pnl - a.pnl);
    
    const myRank = leaderboard.findIndex(u => u.userId === chatId) + 1;
    
    let text = '🏆 *EasyPoly Leaderboard*\n\n';
    
    const medals = ['🥇', '🥈', '🥉'];
    leaderboard.forEach((user, i) => {
      const medal = medals[i] || `${i + 1}.`;
      const isMe = user.userId === chatId;
      const name = isMe ? `*${user.name} (YOU)*` : user.name;
      const sign = user.pnl >= 0 ? '+' : '';
      text += `${medal} ${name} — ${sign}$${user.pnl.toFixed(2)} (${user.trades} trades)\n`;
    });

    if (myRank > 0) {
      text += `\n📍 You're #${myRank} of ${leaderboard.length} traders`;
    }

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[LEADERBOARD]', err.message);
    bot.sendMessage(chatId, `❌ Error: ${err.message}`);
  }
});

// ── Custom amount handler + connect flow ────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = String(msg.chat.id);
  
  // Handle /connect credential flow
  if (connectFlow[chatId]) {
    const flow = connectFlow[chatId];
    const text = msg.text.trim();
    
    // Handle private key import
    if (flow.step === 'awaiting_private_key') {
      bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      bot.sendMessage(chatId, '⏳ Importing wallet and deriving credentials...');
      
      try {
        // Call trader API to derive credentials from private key
        const response = await fetch(`${TRADER_URL}/import-wallet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': TRADER_KEY, 'ngrok-skip-browser-warning': '1' },
          body: JSON.stringify({ 
            telegramUserId: chatId,
            privateKey: text 
          })
        });
        
        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Import failed: ${error}`);
        }
        
        const { walletAddress, apiKey, apiSecret, apiPassphrase } = await response.json();
        
        // Store credentials (no private key for import - already have it client-side)
        userDb.setPolyCredentials(chatId, apiKey, apiSecret, apiPassphrase, walletAddress, text);
        delete connectFlow[chatId];
        
        bot.sendMessage(chatId,
          `🎉 *Wallet Imported!*\n\n` +
          `👛 Address: \`${walletAddress}\`\n\n` +
          `✅ Your wallet is connected and ready!\n` +
          `All bets will be placed in YOUR Polymarket account.\n\n` +
          `Use /wallet to check status\nUse /disconnect to remove`,
          { parse_mode: 'Markdown' }
        );
        
        console.log(`[SETUP_IMPORT] Imported wallet for ${chatId}: ${walletAddress}`);
      } catch (err) {
        delete connectFlow[chatId];
        bot.sendMessage(chatId, 
          `❌ Import failed: ${err.message}\n\n` +
          `Make sure you pasted a valid Polygon private key.\n` +
          `Send /start to try again.`
        );
      }
      return;
    }
    
    if (flow.step === 'awaiting_key') {
      flow.apiKey = text;
      flow.step = 'awaiting_secret';
      bot.sendMessage(chatId, '✅ Got it. Now paste your *API Secret*:', { parse_mode: 'Markdown' });
      // Delete the user's message containing the key for security
      bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      return;
    }
    if (flow.step === 'awaiting_secret') {
      flow.apiSecret = text;
      flow.step = 'awaiting_passphrase';
      bot.sendMessage(chatId, '✅ Got it. Now paste your *API Passphrase*:', { parse_mode: 'Markdown' });
      bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      return;
    }
    if (flow.step === 'awaiting_passphrase') {
      flow.apiPassphrase = text;
      bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      
      // Save encrypted credentials
      try {
        userDb.setPolyCredentials(chatId, flow.apiKey, flow.apiSecret, flow.apiPassphrase, '', null);
        delete connectFlow[chatId];
        bot.sendMessage(chatId,
          `🎉 *Wallet Connected!*\n\n` +
          `Your Polymarket API credentials are saved (encrypted).\n` +
          `All bets will now be placed in YOUR account.\n\n` +
          `🔑 Key: \`${flow.apiKey.substring(0, 8)}...\`\n\n` +
          `Use /wallet to check status\nUse /disconnect to remove`,
          { parse_mode: 'Markdown' }
        );
        console.log(`[CONNECT] User ${chatId} connected Polymarket wallet`);
      } catch (err) {
        delete connectFlow[chatId];
        bot.sendMessage(chatId, `❌ Failed to save credentials: ${err.message}`);
      }
      return;
    }
  }
  
  if (!db.pendingCustom || !db.pendingCustom[chatId]) return;
  
  const amount = parseFloat(msg.text.replace('$', '').trim());
  if (isNaN(amount) || amount < 1 || amount > 1000) {
    bot.sendMessage(chatId, '❌ Enter a valid amount between $1 and $1000');
    return;
  }
  
  const { pickId, messageId } = db.pendingCustom[chatId];
  delete db.pendingCustom[chatId];
  saveDB(db);
  
  const pick = db.picks[pickId];
  if (!pick) {
    bot.sendMessage(chatId, '❌ Pick expired');
    return;
  }

  const customCreds = userDb.getPolyCredentials(chatId);
  const customPrivateKey = userDb.getPrivateKey(chatId);
  if (!customCreds || !customPrivateKey) {
    bot.sendMessage(chatId,
      `🔗 *Set Up Trading Wallet*\n\n` +
      `To place bets, you need a trading wallet with signing capability.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🆕 Create Trading Wallet', callback_data: 'SETUP_CREATE' }],
            [{ text: '🔑 Import Private Key', callback_data: 'SETUP_IMPORT' }]
          ]
        }
      }
    );
    return;
  }

  (async () => {
    try {
      bot.sendMessage(chatId, `🎯 Placing $${amount} bet...`);
      const tradeBody = {
        tokenId: pick.tokenId, side: 'BUY', amount, price: pick.price,
        apiKey: customCreds.apiKey, apiSecret: customCreds.apiSecret, apiPassphrase: customCreds.apiPassphrase,
        privateKey: customPrivateKey, signatureType: 2
      };
      const resp = await fetch(`${TRADER_URL}/forward-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': TRADER_KEY, 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify(tradeBody)
      });
      const text = await resp.text();
      let result;
      try { result = JSON.parse(text); } catch { 
        // Handle HTML error pages (e.g. Railway 404/502 during redeploy)
        const cleanError = text.includes('<!DOCTYPE') || text.includes('<html') 
          ? `Trader temporarily unavailable (HTTP ${resp.status}). Try again in 30 seconds.`
          : `HTTP ${resp.status}: ${text.substring(0, 100)}`;
        result = { success: false, error: cleanError }; 
      }
      
      if (result.success || result.orderID) {
        db.actions.push({ chatId, pickId, action: 'BET', amount, question: pick.question, orderId: result.orderID, ts: Date.now() });
        saveDB(db);
        bot.editMessageReplyMarkup(
          { inline_keyboard: [[{ text: `✅ BET $${amount} PLACED`, callback_data: 'done' }]] },
          { chat_id: chatId, message_id: messageId }
        ).catch(() => {});
        bot.sendMessage(chatId, `✅ Bet placed in YOUR Polymarket account!\n\nOrder: ${result.orderID || 'pending'} | $${amount} @ ${pick.price}`);
      } else {
        bot.sendMessage(chatId, `❌ Bet failed: ${(result.error || 'Unknown').substring(0, 200)}`);
      }
    } catch (err) {
      bot.sendMessage(chatId, `❌ Error: ${err.message.substring(0, 200)}`);
    }
  })();
});

// ── Button callbacks ────────────────────────────────────────
bot.on('callback_query', async (query) => {
  console.log(`[CALLBACK] Received: ${query.data} from ${query.from?.id}`);
  const { data, message } = query;
  const chatId = String(message.chat.id);
  
  const parts = data.split(':');
  const action = parts[0];
  const pickId = parts[1];
  const betAmount = parts[2] ? parseFloat(parts[2]) : 5;
  
  // ── Setup flow handler (MetaMask wallet connection) ──────────────
  if (action === 'SETUP_CONNECT') {
    bot.answerCallbackQuery(query.id, { text: '🔗 Opening wallet connection...' });

    const connectUrl = `${WELCOME_LANDING_URL}/connect?userId=${chatId}`;

    bot.sendMessage(chatId,
      `🔗 *Connect Your Wallet*\n\n` +
      `Click the button below to connect your Polygon wallet via MetaMask.\n\n` +
      `⚠️ *Note:* Browser wallet connect is view-only. For auto-betting, use "Create Trading Wallet" instead.\n\n` +
      `🔒 Your private key never leaves your wallet.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌐 Connect Browser Wallet', url: connectUrl }],
            [{ text: '🆕 Create Trading Wallet Instead', callback_data: 'SETUP_CREATE' }]
          ]
        }
      }
    );
    return;
  }

  // ── Create new trading wallet ──────────────────────────────
  if (action === 'SETUP_CREATE') {
    bot.answerCallbackQuery(query.id, { text: '🆕 Creating wallet...' });

    try {
      bot.sendMessage(chatId, '⏳ Creating your trading wallet and deriving API credentials...');

      const response = await fetch(`${TRADER_URL}/create-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': TRADER_KEY, 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ telegramUserId: chatId })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Wallet creation failed: ${errText.substring(0, 200)}`);
      }

      const { walletAddress, privateKey, apiKey, apiSecret, apiPassphrase } = await response.json();

      // Store everything encrypted
      userDb.setPolyCredentials(chatId, apiKey, apiSecret, apiPassphrase, walletAddress, privateKey);

      console.log(`[SETUP_CREATE] Created wallet for ${chatId}: ${walletAddress}`);

      bot.sendMessage(chatId,
        `🎉 *Trading Wallet Created!*\n\n` +
        `👛 Address:\n\`${walletAddress}\`\n\n` +
        `💰 *Next step:* Deposit USDC on Polygon to this address to start betting.\n\n` +
        `You can send USDC from:\n` +
        `• Coinbase / Binance (withdraw to Polygon)\n` +
        `• MetaMask (send USDC on Polygon network)\n` +
        `• Any exchange that supports Polygon USDC`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔐 Export Private Key', callback_data: 'EXPORT_KEY' }],
              [{ text: '👛 Check Wallet Status', callback_data: 'WALLET_STATUS' }]
            ]
          }
        }
      );
    } catch (err) {
      console.error('[SETUP_CREATE] Error:', err.message);
      bot.sendMessage(chatId, `❌ Failed to create wallet: ${err.message.substring(0, 200)}\n\nPlease try again with /connect`);
    }
    return;
  }

  // ── Import private key flow ────────────────────────────────
  if (action === 'SETUP_IMPORT') {
    bot.answerCallbackQuery(query.id, { text: '🔑 Starting import...' });

    connectFlow[chatId] = { step: 'awaiting_private_key' };

    bot.sendMessage(chatId,
      `🔑 *Import Private Key*\n\n` +
      `Paste your Polygon wallet private key below.\n\n` +
      `We'll derive your Polymarket API credentials automatically.\n\n` +
      `⚠️ Your message will be deleted immediately for security.\n` +
      `🔐 Key is stored encrypted (AES-256-GCM).\n\n` +
      `_Send your private key now:_`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // ── Export private key via button ─────────────────────────
  if (action === 'EXPORT_KEY') {
    bot.answerCallbackQuery(query.id, { text: '🔐 Fetching key...' });
    const privateKey = userDb.getPrivateKey(chatId);
    if (!privateKey) {
      bot.sendMessage(chatId, '❌ No private key found. Use /connect to set up a wallet.');
      return;
    }
    bot.sendMessage(chatId,
      `🔐 *Your Private Key*\n\n` +
      `\`${privateKey}\`\n\n` +
      `⚠️ *KEEP THIS SAFE!* Never share it with anyone.\n` +
      `Delete this message after saving it securely.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // ── Wallet status via button ───────────────────────────────
  if (action === 'WALLET_STATUS') {
    bot.answerCallbackQuery(query.id, { text: '👛 Loading wallet...' });
    const creds = userDb.getPolyCredentials(chatId);
    if (!creds || !creds.walletAddress) {
      bot.sendMessage(chatId, '❌ No wallet connected. Use /connect to set one up.');
      return;
    }
    const maskedKey = creds.apiKey ? creds.apiKey.substring(0, 8) + '...' : 'unknown';
    const hasPrivateKey = !!userDb.getPrivateKey(chatId);
    bot.sendMessage(chatId,
      `✅ *Wallet Connected*\n\n` +
      `👛 Address: \`${creds.walletAddress.substring(0, 10)}...${creds.walletAddress.slice(-6)}\`\n` +
      `🔑 API Key: \`${maskedKey}\`\n\n` +
      `All bets will be placed in YOUR account.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔐 Export Private Key', callback_data: 'EXPORT_KEY' }],
            [{ text: '🗑️ Disconnect Wallet', callback_data: 'SETUP_DISCONNECT' }]
          ]
        }
      }
    );
    return;
  }

  // ── Disconnect handler from connect flow ───────────────────
  if (action === 'SETUP_DISCONNECT') {
    bot.answerCallbackQuery(query.id, { text: '🗑️ Disconnected' });
    userDb.clearPolyCredentials(chatId);
    bot.sendMessage(chatId, '🗑️ Wallet disconnected.\n\nUse /connect to set up a new wallet.');
    return;
  }
  
  if (action === 'CONNECT_WALLET') {
    bot.answerCallbackQuery(query.id, { text: '🔗 Use /connect in DM' });
    bot.sendMessage(chatId, 'Send me /connect in our private chat to set up your wallet.');
    return;
  }

  // ── SELL handler ──────────────────────────────────────────
  if (action === 'SELL') {
    const sellKey = parts[1];
    const cached = global._sellCache && global._sellCache[sellKey];
    const tokenId = cached ? cached.tokenId : parts[1];
    const shares = cached ? cached.shares : (parts[2] ? parseFloat(parts[2]) : 0);
    const outcome = cached ? cached.outcome : (parts[3] || 'YES');
    
    if (!tokenId || !shares) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Sell expired — tap /positions again' });
    }

    const creds = userDb.getPolyCredentials(chatId);
    const sellPrivateKey = userDb.getPrivateKey(chatId);
    if (!creds || !sellPrivateKey) {
      bot.answerCallbackQuery(query.id, { text: '⚠️ Trading wallet needed' });
      bot.sendMessage(chatId,
        `⚠️ *Trading Wallet Required*\n\nTo sell positions, you need a trading wallet. Use /connect to set one up.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    bot.answerCallbackQuery(query.id, { text: '💰 Placing sell order...' });

    try {
      // Place sell via trader (forward-order with user creds + signing key)
      const tradeRes = await fetch(`${TRADER_URL}/forward-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TRADER_KEY, 'ngrok-skip-browser-warning': '1'
        },
        body: JSON.stringify({
          tokenId,
          side: 'SELL',
          amount: (shares * 0.95).toFixed(2),
          price: 0.01, // Market sell — low price to fill immediately
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
          apiPassphrase: creds.apiPassphrase,
          privateKey: sellPrivateKey,
          signatureType: 2
        })
      });

      const sellText = await tradeRes.text();
      let result;
      try { result = JSON.parse(sellText); } catch {
        const cleanErr = sellText.includes('<!DOCTYPE') ? 'Trader temporarily unavailable' : sellText.substring(0, 100);
        result = { error: cleanErr };
      }
      
      if (result.success || result.orderID) {
        bot.editMessageReplyMarkup(
          { inline_keyboard: [[{ text: '✅ SOLD', callback_data: 'done' }]] },
          { chat_id: chatId, message_id: message.message_id }
        ).catch(() => {});
        
        bot.sendMessage(chatId, 
          `✅ *Position Sold!*\n\n` +
          `📊 ${shares} shares of ${outcome}\n` +
          `💰 Order placed on Polymarket\n\n` +
          `Use /positions to see updated portfolio.`,
          { parse_mode: 'Markdown' }
        );
      } else {
        bot.sendMessage(chatId, `❌ Sell failed: ${result.error || 'Unknown error'}\n\nTry selling on polymarket.com directly.`);
      }
    } catch (err) {
      console.error('[SELL]', err.message);
      bot.sendMessage(chatId, `❌ Sell error: ${err.message}`);
    }
    return;
  }

  if (!['BET', 'SKIP', 'CUSTOM'].includes(action)) {
    return bot.answerCallbackQuery(query.id, { text: '❓ Unknown' });
  }

  if (action === 'CUSTOM') {
    const pick = db.picks[pickId];
    if (!pick) return bot.answerCallbackQuery(query.id, { text: '❌ Pick expired' });
    
    if (!db.pendingCustom) db.pendingCustom = {};
    db.pendingCustom[chatId] = { pickId, messageId: message.message_id };
    saveDB(db);
    
    bot.answerCallbackQuery(query.id, { text: '✏️ Type your bet amount' });
    bot.sendMessage(chatId, `✏️ Type your bet amount in $ (e.g. <b>50</b> or <b>100</b>):`, { parse_mode: 'HTML' });
    return;
  }

  const pick = db.picks[pickId];
  if (!pick) {
    return bot.answerCallbackQuery(query.id, { text: '❌ Pick expired' });
  }

  const existing = db.actions.find(a => a.chatId === chatId && a.pickId === pickId);
  if (existing) {
    return bot.answerCallbackQuery(query.id, { text: `Already ${existing.action}ed this one!` });
  }

  if (action === 'SKIP') {
    db.actions.push({ chatId, pickId, action: 'SKIP', question: pick.question || 'Demo', ts: Date.now() });
    saveDB(db);
    bot.answerCallbackQuery(query.id, { text: '⏭️ Skipped!' });
    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: '⏭️ SKIPPED', callback_data: 'done' }]] },
      { chat_id: chatId, message_id: message.message_id }
    ).catch(() => {});
    return;
  }

  // Check if this is a demo pick (no real market)
  if (pickId.startsWith('demo-')) {
    bot.answerCallbackQuery(query.id, { text: '🔗 Connect wallet first!' });

    // Check if user already has a wallet
    const existingCreds = userDb.getPolyCredentials(chatId);
    if (existingCreds && existingCreds.walletAddress) {
      // User already has wallet set up
      bot.sendMessage(chatId,
        `✅ *Wallet Already Connected!*\n\n` +
        `👛 Address: \`${existingCreds.walletAddress.substring(0, 10)}...${existingCreds.walletAddress.slice(-8)}\`\n\n` +
        `You're all set! Real picks coming soon... 📊\n\n` +
        `Use /wallet to view details`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Send wallet setup options
    bot.sendMessage(chatId,
      `🔗 *Set Up Your Wallet*\n\n` +
      `Choose how you want to trade:\n\n` +
      `🆕 *Create Wallet* — We generate a fresh wallet for you. Fund it with USDC and start betting!\n` +
      `🔑 *Import Key* — Paste your existing Polymarket private key`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🆕 Create Trading Wallet', callback_data: 'SETUP_CREATE' }],
            [{ text: '🔑 Import Private Key', callback_data: 'SETUP_IMPORT' }]
          ]
        }
      }
    );
    return;
  }

  // BET — require user wallet with signing capability
  {
    const betCreds = userDb.getPolyCredentials(chatId);
    if (!betCreds) {
      bot.answerCallbackQuery(query.id, { text: '🔗 Connect wallet first!' });
      bot.sendMessage(chatId,
        `🔗 *Set Up Your Wallet*\n\n` +
        `To place bets, you need a trading wallet.\n\n` +
        `🆕 *Create Wallet* — We generate a fresh wallet. Fund with USDC and bet!\n` +
        `🔑 *Import Key* — Use your existing Polymarket private key`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🆕 Create Trading Wallet', callback_data: 'SETUP_CREATE' }],
              [{ text: '🔑 Import Private Key', callback_data: 'SETUP_IMPORT' }]
            ]
          }
        }
      );
      return;
    }

    // Check if user has a private key (needed for signing orders)
    const betPrivateKey = userDb.getPrivateKey(chatId);
    if (!betPrivateKey) {
      bot.answerCallbackQuery(query.id, { text: '🔧 One-time setup needed!' });
      bot.sendMessage(chatId,
        `🔧 *One-Time Trading Setup*\n\n` +
        `You're a Pro member! 🎉 Just one quick step to start betting.\n\n` +
        `Create a *trading wallet* so the bot can sign orders for you. This takes about 30 seconds and only needs to be done once.\n\n` +
        `🆕 *Create Wallet* — We generate a fresh wallet. Fund with USDC on Polygon.\n` +
        `🔑 *Import Key* — Use your existing Polymarket private key`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🆕 Create Trading Wallet', callback_data: 'SETUP_CREATE' }],
              [{ text: '🔑 Import Private Key', callback_data: 'SETUP_IMPORT' }]
            ]
          }
        }
      );
      return;
    }
  }

  bot.answerCallbackQuery(query.id, { text: '🎯 Placing bet...' });

  try {
    // User has credentials + private key — use their wallet
    const betCreds = userDb.getPolyCredentials(chatId);
    const userPrivateKey = userDb.getPrivateKey(chatId);

    // REAL-TIME PRICE: Fetch live orderbook price before placing bet
    let livePrice = pick.price;
    const MAX_SLIPPAGE = 0.05; // 5% max price movement allowed
    try {
      if (pick.tokenId && pick.tokenId.length > 50) {
        const bookResp = await fetch(`https://clob.polymarket.com/book?token_id=${pick.tokenId}`);
        if (bookResp.ok) {
          const book = await bookResp.json();
          const asks = book.asks || [];
          if (asks.length > 0) {
            livePrice = parseFloat(asks[0].price);
            const priceDelta = Math.abs(livePrice - pick.price) / pick.price;
            if (priceDelta > MAX_SLIPPAGE) {
              console.log(`[BET] Price moved too much: was ${pick.price}, now ${livePrice} (${(priceDelta*100).toFixed(1)}% change)`);
              bot.sendMessage(chatId,
                `⚠️ Price has moved since this pick was sent.\n\n` +
                `Was: ${(pick.price * 100).toFixed(0)}¢ → Now: ${(livePrice * 100).toFixed(0)}¢\n\n` +
                `The bet was NOT placed to protect you from slippage. Wait for the next pick or try a lower amount.`
              );
              return;
            }
          }
        }
      }
    } catch (priceErr) {
      console.log(`[BET] Live price check failed (using pick price): ${priceErr.message}`);
    }

    console.log(`[BET] ${chatId} betting $${betAmount} on ${pickId} — token: ${(pick.tokenId||'').substring(0,20)}... pickPrice: ${pick.price} livePrice: ${livePrice} (USER wallet)`);

    const tradeBody = {
      tokenId: pick.tokenId,
      side: 'BUY',
      amount: betAmount,
      price: livePrice, // Use LIVE price, not stale pick price
      apiKey: betCreds.apiKey,
      apiSecret: betCreds.apiSecret,
      apiPassphrase: betCreds.apiPassphrase,
      privateKey: userPrivateKey,
      signatureType: 2
    };
    const resp = await fetch(`${TRADER_URL}/forward-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': TRADER_KEY, 'ngrok-skip-browser-warning': '1' },
      body: JSON.stringify(tradeBody)
    });
    const text = await resp.text();
    console.log(`[BET] Response (${resp.status}):`, text.substring(0, 500));
    let result;
    try { result = JSON.parse(text); } catch {
      const cleanError = text.includes('<!DOCTYPE') || text.includes('<html')
        ? `Trader temporarily unavailable (HTTP ${resp.status}). Try again in 30 seconds.`
        : `HTTP ${resp.status}: ${text.substring(0, 100)}`;
      result = { success: false, error: cleanError };
    }

    if (result.success || result.orderID) {
      db.actions.push({ chatId, pickId, action: 'BET', amount: betAmount, question: pick.question, orderId: result.orderID, ts: Date.now() });
      saveDB(db);
      bot.editMessageReplyMarkup(
        { inline_keyboard: [[{ text: `✅ BET $${betAmount} PLACED`, callback_data: 'done' }]] },
        { chat_id: chatId, message_id: message.message_id }
      ).catch(() => {});
      bot.sendMessage(chatId, `✅ Bet placed in YOUR Polymarket account!\n\nOrder: ${result.orderID || 'pending'} | $${betAmount} @ ${(livePrice * 100).toFixed(0)}¢`).catch(e => console.log('send err:', e.message));
    } else {
      console.log(`[BET] FAILED:`, result.error);
      const errMsg = (result.error || 'Unknown').substring(0, 200);
      bot.sendMessage(chatId, `❌ Bet failed: ${errMsg}`).catch(() => {});
    }
  } catch (err) {
    console.error('[BET] ERROR:', err.message);
    bot.sendMessage(chatId, `❌ Bet error: ${err.message.substring(0, 200)}`).catch(() => {});
  }
});

// ── Paywall helper ──────────────────────────────────────────
async function sendPaywall(chatId) {
  try {
    const session = await stripe.createCheckoutSession(chatId);
    if (session.url) {
      await bot.sendMessage(chatId,
        `🔒 *You've used your ${FREE_PICKS} free picks!*\n\nUpgrade to *EasyPoly Pro* for unlimited AI picks.\n\n💰 Just $9/month`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '💳 Upgrade to Pro — $9/mo', url: session.url }]]
          }
        }
      );
    }
  } catch (err) {
    console.error('Paywall error:', err.message);
    await bot.sendMessage(chatId, `🔒 You've used your ${FREE_PICKS} free picks! Send /subscribe to upgrade.`);
  }
}

// ── API Server ──────────────────────────────────────────────
const app = express();

// Stripe webhook needs raw body
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const payload = req.body.toString();

  if (sig && !stripe.verifyWebhookSignature(payload, sig)) {
    console.log('⚠️ Stripe webhook signature mismatch');
    return res.status(400).send('Bad signature');
  }

  try {
    const event = JSON.parse(payload);
    console.log(`[STRIPE] Event: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const telegramUserId = session.metadata?.telegram_user_id;
      const customerId = session.customer;

      if (telegramUserId) {
        userDb.markPro(telegramUserId, customerId);
        console.log(`[STRIPE] ✅ User ${telegramUserId} upgraded to Pro`);

        // Notify user
        try {
          await bot.sendMessage(telegramUserId,
            '🎉 *Welcome to EasyPoly Pro!*\n\nYou now have unlimited AI picks. Enjoy! 🚀',
            { parse_mode: 'Markdown' }
          );
        } catch (e) { console.log('Notify error:', e.message); }
      }
    }

    // Handle subscription cancellation
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const telegramUserId = sub.metadata?.telegram_user_id;
      if (telegramUserId) {
        userDb.markFree(telegramUserId);
        console.log(`[STRIPE] Subscription canceled — demoted user ${telegramUserId}`);
        try {
          await bot.sendMessage(telegramUserId, '⚠️ Your Pro subscription has been cancelled. You will no longer receive pick DMs.\n\nUse /subscribe to re-activate anytime.');
        } catch (e) { /* user may have blocked bot */ }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).send('Error');
  }
});

// Enable CORS for wallet callback from Vercel
app.use(cors({
  origin: [
    'https://easypoly-landing.vercel.app',
    'https://www.easypoly.lol',
    'https://easypoly.lol',
    /\.vercel\.app$/  // Allow all Vercel preview deployments
  ],
  credentials: true
}));

app.use(express.json());

const apiAuth = (req, res, next) => {
  if (req.headers['x-api-key'] !== API_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

app.get('/', (req, res) => {
  const subs = userDb.getActiveUsers().length;
  res.json({ service: 'easypoly-bot', version: BOT_VERSION, subscribers: subs, status: 'running' });
});

app.get('/health', (req, res) => {
  const uptime = process.uptime();
  const subs = userDb.getActiveUsers().length;
  const proUsers = userDb.getActiveUsers().filter(u => u.is_pro).length;
  res.json({
    status: 'ok',
    uptime: Math.floor(uptime),
    uptimeHuman: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    subscribers: subs,
    proUsers,
    version: BOT_VERSION,
    timestamp: new Date().toISOString(),
  });
});

// ── Pick deduplication & rate limiting ───────────────────────
const sentPicks = new Map();  // pickHash → timestamp (last sent)
const PICK_RATE_LIMIT = 5;                // max picks per hour
const PICK_FRESHNESS_WINDOW = 60 * 60 * 1000;   // 1 hour in ms
const PICK_DEDUP_WINDOW = 24 * 60 * 60 * 1000;  // 24 hours in ms

// Periodically clean up stale entries (every hour)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [hash, ts] of sentPicks) {
    if (now - ts > PICK_DEDUP_WINDOW) {
      sentPicks.delete(hash);
      cleaned++;
    }
  }
  if (cleaned > 0) console.log(`[DEDUP] Cleaned ${cleaned} stale pick entries`);
}, 60 * 60 * 1000);

// Broadcast picks — Pro users get DMs with BET buttons, everyone sees Alerts group
app.post('/broadcast', apiAuth, async (req, res) => {
  const { picks } = req.body;
  if (!picks || !picks.length) return res.status(400).json({ error: 'No picks' });

  const now = Date.now();

  // ── Rate limit: max N picks broadcast per hour ──
  const recentCount = Array.from(sentPicks.values()).filter(t => now - t < 60 * 60 * 1000).length;
  if (recentCount >= PICK_RATE_LIMIT) {
    console.log(`[RATE] Broadcast rejected: ${recentCount} picks in last hour (limit ${PICK_RATE_LIMIT})`);
    return res.status(429).json({
      error: `Rate limit: max ${PICK_RATE_LIMIT} picks/hour`,
      recentCount,
      retryAfterMs: 60 * 60 * 1000,
    });
  }

  // ── Dedup + freshness filter ──
  const validPicks = [];
  const rejected = { duplicate: 0, stale: 0 };

  for (const pick of picks) {
    // Freshness check: reject picks with createdAt older than 1 hour
    if (pick.createdAt) {
      const pickAge = now - new Date(pick.createdAt).getTime();
      if (pickAge > PICK_FRESHNESS_WINDOW) {
        console.log(`[DEDUP] Stale pick rejected (age ${Math.round(pickAge / 60000)}min): ${pick.question}`);
        rejected.stale++;
        continue;
      }
    }

    // Deterministic hash from question + side (case-insensitive, trimmed)
    const pickHash = crypto.createHash('md5')
      .update((pick.question || '').trim().toLowerCase() + ':' + (pick.side || '').trim().toLowerCase())
      .digest('hex');

    if (sentPicks.has(pickHash)) {
      const lastSent = sentPicks.get(pickHash);
      if (now - lastSent < PICK_DEDUP_WINDOW) {
        console.log(`[DEDUP] Duplicate pick rejected (sent ${Math.round((now - lastSent) / 60000)}min ago): ${pick.question}`);
        rejected.duplicate++;
        continue;
      }
    }

    validPicks.push(pick);
    sentPicks.set(pickHash, now);
  }

  if (validPicks.length === 0) {
    console.log(`[DEDUP] All ${picks.length} picks filtered (${rejected.duplicate} dupes, ${rejected.stale} stale)`);
    return res.json({
      success: true,
      sent: 0,
      subscribers: 0,
      filtered: rejected,
      message: 'All picks filtered (duplicates or stale)',
    });
  }

  console.log(`[BROADCAST] ${validPicks.length}/${picks.length} picks passed filters (${rejected.duplicate} dupes, ${rejected.stale} stale)`);

  // Sync Pro status from Supabase before broadcasting
  await syncProStatus();

  const activeUsers = userDb.getActiveUsers();
  const ALERTS_GROUP_ID = process.env.ALERTS_GROUP_ID;
  let sent = 0;
  let groupSent = 0;

  for (const pick of validPicks) {
    const pickId = crypto.randomUUID().substring(0, 8);
    db.picks[pickId] = {
      question: pick.question || '',
      side: pick.side || 'YES',
      price: pick.price || 0.5,
      confidence: pick.confidence || 'Medium',
      reasoning: pick.reasoning || '',
      tokenId: pick.tokenId || '',
      createdAt: new Date().toISOString()
    };

    const conf = { High: '🔥', Medium: '📊', Low: '🤔' }[pick.confidence] || '📊';
    const esc = (s) => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    // ── Pro DM message (full details + BET buttons) ──
    const edgeLine = pick.edgePoints ? `📐 Edge: <b>${Number(pick.edgePoints).toFixed(0)}pts</b>\n` : '';
    const dmText = `${conf} <b>NEW PICK</b>\n\n` +
      `<b>${esc(pick.question)}</b>\n\n` +
      `📈 Side: <b>${esc(pick.side)}</b>\n` +
      `💰 Price: <b>${(pick.price * 100).toFixed(0)}¢</b>\n` +
      edgeLine +
      `🎯 Confidence: <b>${esc(pick.confidence)}</b>\n\n` +
      `${pick.reasoning ? `💡 <i>${esc(pick.reasoning.substring(0, 300))}</i>` : ''}`;

    const dmKeyboard = {
      inline_keyboard: [
        [
          { text: '🎯 $5', callback_data: `BET:${pickId}:5` },
          { text: '💰 $10', callback_data: `BET:${pickId}:10` },
          { text: '🔥 $25', callback_data: `BET:${pickId}:25` },
        ],
        [
          { text: '✏️ Custom', callback_data: `CUSTOM:${pickId}` },
          { text: '⏭️ SKIP', callback_data: `SKIP:${pickId}` }
        ],
        [
          { text: '📊 Full Analysis on EasyPoly', url: 'https://easypoly.lol/dashboard' }
        ]
      ]
    };

    // Send DMs to all active users (Pro gating disabled for beta)
    for (const user of activeUsers) {
      const chatId = user.user_id;

      // Skip invalid chat IDs (must be numeric for Telegram)
      if (!/^-?\d+$/.test(String(chatId))) {
        console.log(`[i] Skipping invalid chat ID: ${chatId}`);
        userDb.setSubscribed(chatId, false);
        continue;
      }

      // BETA MODE: all users get DM picks (re-enable Pro check after beta)
      // if (!user.is_pro) continue;

      try {
        await bot.sendMessage(chatId, dmText, { parse_mode: 'HTML', reply_markup: dmKeyboard });
        userDb.incrementPicks(chatId);
        sent++;
        if (sent % 25 === 0) await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.log(`[!] Send failed ${chatId}: ${err.message}`);
        const code = err.response?.statusCode;
        if (code === 403 || code === 400) {
          userDb.setSubscribed(chatId, false);
          console.log(`[i] Auto-unsubscribed ${chatId} (HTTP ${code})`);
        }
      }
    }

    // ── Alerts group broadcast (free, public, read-only) ──
    if (ALERTS_GROUP_ID) {
      const groupText = `${conf} <b>NEW PICK</b>\n\n` +
        `<b>${esc(pick.question)}</b>\n\n` +
        `📈 Side: <b>${esc(pick.side)}</b>\n` +
        `💰 Price: <b>${(pick.price * 100).toFixed(0)}¢</b>\n` +
        edgeLine +
        `🎯 Confidence: <b>${esc(pick.confidence)}</b>\n\n` +
        `${pick.reasoning ? `💡 <i>${esc(pick.reasoning.substring(0, 200))}</i>` : ''}`;

      const marketSlug = pick.slug || '';
      const marketUrl = marketSlug
        ? `https://easypoly.lol/dashboard?market=${encodeURIComponent(marketSlug)}`
        : 'https://easypoly.lol/dashboard';

      const groupKeyboard = {
        inline_keyboard: [
          [{ text: '📊 View on EasyPoly', url: marketUrl }]
        ]
      };

      try {
        await bot.sendMessage(ALERTS_GROUP_ID, groupText, {
          parse_mode: 'HTML', reply_markup: groupKeyboard
        });
        groupSent++;
      } catch (err) {
        console.log(`[!] Alerts group send failed: ${err.message}`);
      }
    }
  }

  saveDB(db);
  res.json({
    success: true,
    picks: validPicks.length,
    picksSubmitted: picks.length,
    filtered: rejected,
    dmsSent: sent,
    groupSent,
    subscribers: activeUsers.length,
    proUsers: activeUsers.filter(u => u.is_pro).length
  });
});

app.get('/subscribers', apiAuth, (req, res) => {
  const users = userDb.getActiveUsers();
  res.json({ count: users.length, users });
});

// Unsubscribe a specific user by ID (for cleaning up test/junk entries)
app.delete('/subscribers/:userId', apiAuth, (req, res) => {
  const { userId } = req.params;
  userDb.setSubscribed(userId, false);
  res.json({ success: true, unsubscribed: userId });
});

app.get('/picks', apiAuth, (req, res) => {
  res.json({ picks: db.picks });
});

// ── Web3 Wallet Connection Callback ─────────────────────────
app.post('/callback/wallet', async (req, res) => {
  try {
    const { telegramUserId, walletAddress, apiKey, apiSecret, apiPassphrase, privateKey } = req.body;

    if (!telegramUserId || !apiKey || !apiSecret || !apiPassphrase) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`[WALLET] Connection from user ${telegramUserId}, wallet ${walletAddress?.substring(0, 10)}...`);

    // Ensure user exists
    userDb.upsertUser(String(telegramUserId), '', '');

    // Store encrypted credentials (including private key if provided)
    userDb.setPolyCredentials(
      String(telegramUserId),
      apiKey,
      apiSecret,
      apiPassphrase,
      walletAddress || '',
      privateKey || null
    );

    console.log(`[WALLET] ✅ Credentials saved for user ${telegramUserId} (privateKey: ${privateKey ? 'yes' : 'no'})`);

    // Notify user in Telegram
    try {
      if (privateKey) {
        // Full trading wallet — ready to bet
        await bot.sendMessage(
          String(telegramUserId),
          `🎉 *Wallet Connected!*\n\n` +
          `👛 ${walletAddress ? `\`${walletAddress.substring(0, 10)}...${walletAddress.substring(walletAddress.length - 8)}\`` : 'Connected'}\n\n` +
          `✅ All bets will be placed in YOUR Polymarket account.\n\n` +
          `You're ready to receive picks! First one coming soon... 📊`,
          { parse_mode: 'Markdown' }
        );
      } else {
        // MetaMask-only — needs trading wallet for betting
        await bot.sendMessage(
          String(telegramUserId),
          `🔗 *Browser Wallet Linked!*\n\n` +
          `👛 ${walletAddress ? `\`${walletAddress.substring(0, 10)}...${walletAddress.substring(walletAddress.length - 8)}\`` : 'Connected'}\n\n` +
          `⚠️ Your browser wallet can't sign orders automatically.\n` +
          `To place bets from Telegram, create a *trading wallet*:\n`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🆕 Create Trading Wallet', callback_data: 'SETUP_CREATE' }],
                [{ text: '🔑 Import Private Key', callback_data: 'SETUP_IMPORT' }]
              ]
            }
          }
        );
      }
    } catch (err) {
      console.log(`[WALLET] Notify error: ${err.message}`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[WALLET] Callback error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  const subs = userDb.getActiveUsers().length;
  console.log(`🎯 EasyPoly Bot running on :${PORT} (${subs} subscribers)`);
});
// Force redeploy 1770843616
