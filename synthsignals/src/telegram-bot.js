import TelegramBot from 'node-telegram-bot-api';
import { config } from './config.js';
import { addSubscriber, removeSubscriber, getSubscribers, hasSubscribers } from './database.js';
import { monitor } from './monitor.js';
import { alertEngine } from './alerts.js';

class SynthSignalsBot {
  constructor() {
    this.bot = null;
    this.userSettings = new Map(); // chatId -> settings
  }

  async initialize() {
    if (!config.telegram.botToken) {
      console.error('❌ Telegram bot token not configured');
      return false;
    }

    this.bot = new TelegramBot(config.telegram.botToken, { polling: true });
    this.setupCommands();
    this.setupCallbackHandlers();
    
    console.log('✅ Telegram bot initialized');
    return true;
  }

  setupCommands() {
    // /start command
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      addSubscriber(chatId);
      
      const welcomeMessage = `🚀 *Welcome to SynthSignals!*

I monitor Synthdata predictions and alert you when high-edge opportunities appear on Polymarket.

*Commands:*
/start - Subscribe to alerts
/stop - Unsubscribe from alerts
/settings - Configure your preferences
/status - Check system status
/history - View recent signals

*Current Settings:*
• Edge threshold: ${config.alerts.edgeThreshold}%
• Assets: ${config.synthdata.assets.join(', ')}
• Alert frequency: Max 1 per hour per asset

You'll receive alerts when edge > ${config.alerts.edgeThreshold}% 🔥`;

      await this.bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
    });

    // /stop command
    this.bot.onText(/\/stop/, async (msg) => {
      const chatId = msg.chat.id;
      removeSubscriber(chatId);
      
      await this.bot.sendMessage(
        chatId,
        '✋ You have been unsubscribed from alerts.\n\nUse /start to subscribe again.',
        { parse_mode: 'Markdown' }
      );
    });

    // /status command
    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      const monitorStatus = monitor.getStatus();
      const alertStats = alertEngine.getStats();
      const subscriberCount = getSubscribers().length;

      const statusMessage = `📊 *SynthSignals Status*

*Monitor:*
• Last update: ${monitorStatus.lastFetchTime ? monitorStatus.lastFetchTime.toLocaleString() : 'Never'}
• Assets tracked: ${monitorStatus.assets.join(', ')}
• Data source: ${monitorStatus.useMockData ? 'Mock (testing)' : 'Synthdata API'}

*Alerts:*
• Edge threshold: ${alertStats.edgeThreshold}%
• Rate limit: ${alertStats.maxAlertsPerHour} per hour per asset
• Recent alerts: ${alertStats.recentAlerts.length}

*Subscribers:*
• Total: ${subscriberCount}

*Next poll:* ${this.getNextPollTime()}`;

      await this.bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
    });

    // /settings command
    this.bot.onText(/\/settings/, async (msg) => {
      const chatId = msg.chat.id;
      
      const keyboard = {
        inline_keyboard: [
          [
            { text: '🎯 Edge: 10%', callback_data: 'edge_10' },
            { text: '🎯 Edge: 15%', callback_data: 'edge_15' },
            { text: '🎯 Edge: 20%', callback_data: 'edge_20' }
          ],
          [
            { text: '📊 BTC only', callback_data: 'asset_btc' },
            { text: '📊 ETH only', callback_data: 'asset_eth' },
            { text: '📊 All assets', callback_data: 'asset_all' }
          ]
        ]
      };

      await this.bot.sendMessage(
        chatId,
        '⚙️ *Settings*\n\nChoose your preferences:',
        { 
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    });

    // /history command
    this.bot.onText(/\/history/, async (msg) => {
      const chatId = msg.chat.id;
      
      await this.bot.sendMessage(
        chatId,
        '📜 *Recent Signals*\n\nThis feature will show signals from the last 24 hours.\n\n_Coming soon!_',
        { parse_mode: 'Markdown' }
      );
    });

    // /help command
    this.bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      
      const helpMessage = `🤖 *SynthSignals Help*

*What is this?*
I monitor Synthdata AI predictions and compare them to Polymarket odds. When I find a significant edge (difference), I alert you.

*How it works:*
1. Every 5 minutes, I check BTC, ETH, and SOL predictions
2. I calculate the edge (Synthdata % - Polymarket %)
3. If edge > ${config.alerts.edgeThreshold}%, you get an alert
4. Max 1 alert per hour per asset (no spam!)

*Commands:*
/start - Subscribe to alerts
/stop - Unsubscribe
/settings - Configure preferences
/status - System status
/history - Recent signals
/help - This message

*Tips:*
• Higher edge = bigger opportunity
• Confidence score helps you prioritize
• Always DYOR before trading!

Questions? DM @miyamotolabs on Twitter`;

      await this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
    });
  }

  setupCallbackHandlers() {
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;

      if (data.startsWith('edge_')) {
        const threshold = parseInt(data.split('_')[1]);
        await this.bot.answerCallbackQuery(query.id, { text: `Edge threshold set to ${threshold}%` });
        await this.bot.sendMessage(chatId, `✅ Edge threshold updated to ${threshold}%\n\n_Note: This is a per-user setting (not yet implemented in v1)_`, { parse_mode: 'Markdown' });
      }

      if (data.startsWith('asset_')) {
        const asset = data.split('_')[1].toUpperCase();
        const assetText = asset === 'ALL' ? 'all assets' : asset;
        await this.bot.answerCallbackQuery(query.id, { text: `Watching ${assetText}` });
        await this.bot.sendMessage(chatId, `✅ Now watching ${assetText}\n\n_Note: This is a per-user setting (not yet implemented in v1)_`, { parse_mode: 'Markdown' });
      }
    });
  }

  getNextPollTime() {
    const interval = config.alerts.pollIntervalMs;
    const minutes = Math.floor(interval / 60000);
    return `~${minutes} minutes`;
  }

  async broadcastAlert(alert) {
    const subscribers = getSubscribers();
    
    if (subscribers.length === 0) {
      console.log('ℹ️  No subscribers to send alert to');
      return;
    }

    console.log(`📤 Broadcasting alert to ${subscribers.length} subscribers`);
    
    for (const chatId of subscribers) {
      try {
        await this.bot.sendMessage(chatId, alert.message, { 
          parse_mode: 'Markdown',
          disable_web_page_preview: false
        });
        console.log(`✅ Alert sent to ${chatId}`);
      } catch (error) {
        console.error(`❌ Error sending alert to ${chatId}:`, error.message);
      }
    }
  }

  async sendTestAlert() {
    const testSignal = {
      asset: 'BTC',
      direction: 'UP',
      edge: 18.5,
      synthProb: 65.2,
      polyProb: 46.7,
      confidence: 'HIGH',
      polymarketUrl: 'https://polymarket.com',
      timestamp: new Date().toISOString()
    };

    const message = alertEngine.formatAlertMessage(testSignal);
    await this.broadcastAlert({ message, signal: testSignal });
  }

  isRunning() {
    return this.bot !== null;
  }
}

export const telegramBot = new SynthSignalsBot();
