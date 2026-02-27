#!/usr/bin/env node

import { validateConfig, config } from './config.js';
import { initDatabase } from './database.js';
import { monitor } from './monitor.js';
import { alertEngine } from './alerts.js';
import { telegramBot } from './telegram-bot.js';

let pollInterval = null;

async function pollAndAlert() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 Starting poll cycle...');
    
    // Poll Synthdata for all assets
    const signals = await monitor.pollAllAssets();
    
    if (signals.length === 0) {
      console.log('ℹ️  No signals detected');
      return;
    }

    // Process signals and generate alerts
    const alerts = await alertEngine.processSignals(signals);
    
    if (alerts.length === 0) {
      console.log('ℹ️  No alerts triggered (edge threshold not met or rate limited)');
      return;
    }

    // Broadcast alerts to subscribers
    for (const alert of alerts) {
      await telegramBot.broadcastAlert(alert);
    }
    
    console.log(`✅ Poll cycle complete: ${signals.length} signals, ${alerts.length} alerts`);
  } catch (error) {
    console.error('❌ Error in poll cycle:', error);
  }
}

async function startMonitoring() {
  console.log('🚀 Starting SynthSignals monitoring...');
  
  // Run first poll immediately
  await pollAndAlert();
  
  // Schedule regular polling
  pollInterval = setInterval(pollAndAlert, config.alerts.pollIntervalMs);
  
  console.log(`⏰ Monitoring started (polling every ${config.alerts.pollIntervalMs / 60000} minutes)`);
}

function stopMonitoring() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('⏸️  Monitoring stopped');
  }
}

async function main() {
  console.log('🚀 SynthSignals - Real-Time Polymarket Alert System');
  console.log('='.repeat(60));
  
  // Validate configuration
  if (!validateConfig()) {
    console.error('\n❌ Configuration validation failed. Check your .env file.');
    process.exit(1);
  }
  
  console.log('✅ Configuration validated');
  
  // Initialize database
  try {
    initDatabase();
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
  
  // Initialize Telegram bot
  const botInitialized = await telegramBot.initialize();
  if (!botInitialized) {
    console.error('❌ Telegram bot initialization failed');
    process.exit(1);
  }
  
  // Start monitoring
  await startMonitoring();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    stopMonitoring();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    stopMonitoring();
    process.exit(0);
  });
  
  console.log('\n✅ SynthSignals is running!');
  console.log('📱 Use /start in Telegram to subscribe to alerts');
  console.log('⌨️  Press Ctrl+C to stop\n');
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { startMonitoring, stopMonitoring, pollAndAlert };
