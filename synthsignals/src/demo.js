#!/usr/bin/env node

// Demo script - shows alert formatting without database
import { monitor } from './monitor.js';
import { alertEngine } from './alerts.js';

console.log('🎬 SynthSignals Demo - Alert Formatting\n');
console.log('='.repeat(60));

async function demo() {
  // Get mock signals
  const signals = await monitor.pollAllAssets();
  
  console.log(`\n📊 Generated ${signals.length} signals\n`);
  
  // Show signals that would trigger alerts (edge > 15%)
  const highEdgeSignals = signals.filter(s => Math.abs(s.edge) >= 15);
  
  console.log(`🚨 ${highEdgeSignals.length} signals meet edge threshold (>15%):\n`);
  
  for (const signal of highEdgeSignals) {
    console.log('─'.repeat(60));
    const message = alertEngine.formatAlertMessage(signal);
    console.log(message);
    console.log('─'.repeat(60));
    console.log('');
  }
  
  console.log('✅ Demo complete!\n');
  console.log('This is what users will receive in Telegram when an edge is detected.\n');
}

demo().catch(console.error);
