#!/usr/bin/env node

import { monitor } from './monitor.js';
import { alertEngine } from './alerts.js';
import { config } from './config.js';

console.log('🧪 SynthSignals Test Suite\n');
console.log('Configuration:');
console.log(`  • API URL: ${config.synthdata.apiUrl}`);
console.log(`  • Assets: ${config.synthdata.assets.join(', ')}`);
console.log(`  • Edge threshold: ${config.alerts.edgeThreshold}%`);
console.log(`  • Using mock data: ${!config.synthdata.apiKey || config.env === 'development'}`);
console.log('');

async function testMonitor() {
  console.log('📊 Testing Synthdata monitor...\n');
  
  try {
    const signals = await monitor.pollAllAssets();
    
    console.log(`✅ Fetched ${signals.length} signals:\n`);
    
    signals.forEach((signal, index) => {
      console.log(`${index + 1}. ${signal.asset} ${signal.direction}`);
      console.log(`   Edge: ${signal.edge > 0 ? '+' : ''}${signal.edge.toFixed(1)}%`);
      console.log(`   Synthdata: ${signal.synthProb.toFixed(1)}% | Polymarket: ${signal.polyProb.toFixed(1)}%`);
      console.log(`   Confidence: ${signal.confidence}`);
      console.log('');
    });
    
    return signals;
  } catch (error) {
    console.error('❌ Monitor test failed:', error);
    return [];
  }
}

async function testAlertEngine(signals) {
  console.log('🚨 Testing alert engine...\n');
  
  try {
    const alerts = await alertEngine.processSignals(signals);
    
    console.log(`✅ Generated ${alerts.length} alerts:\n`);
    
    alerts.forEach((alert, index) => {
      console.log(`${index + 1}. Alert for ${alert.signal.asset}:`);
      console.log('─'.repeat(60));
      console.log(alert.message);
      console.log('─'.repeat(60));
      console.log('');
    });
    
    if (alerts.length === 0) {
      console.log('ℹ️  No alerts generated (edge threshold not met or rate limited)');
    }
    
    return alerts;
  } catch (error) {
    console.error('❌ Alert engine test failed:', error);
    return [];
  }
}

async function testFullCycle() {
  console.log('🔄 Running full test cycle...\n');
  
  const signals = await testMonitor();
  
  if (signals.length > 0) {
    await testAlertEngine(signals);
  }
  
  console.log('✅ Test complete!\n');
  console.log('Next steps:');
  console.log('  1. Set SYNTHDATA_API_KEY in .env for real data');
  console.log('  2. Set TELEGRAM_BOT_TOKEN in .env');
  console.log('  3. Configure Supabase credentials');
  console.log('  4. Run: npm start');
}

// Run tests
testFullCycle().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
