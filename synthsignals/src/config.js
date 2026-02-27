import dotenv from 'dotenv';
dotenv.config();

export const config = {
  synthdata: {
    apiKey: process.env.SYNTHDATA_API_KEY,
    apiUrl: process.env.SYNTHDATA_API_URL || 'https://api.synthdata.com',
    endpoint: '/insights/polymarket/up-down/hourly',
    assets: ['BTC', 'ETH', 'SOL']
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY
  },
  alerts: {
    edgeThreshold: parseFloat(process.env.EDGE_THRESHOLD) || 15,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS) || 300000, // 5 minutes
    maxAlertsPerHourPerAsset: parseInt(process.env.MAX_ALERTS_PER_HOUR_PER_ASSET) || 1
  },
  env: process.env.NODE_ENV || 'development'
};

// Validation
export function validateConfig() {
  const errors = [];
  
  if (!config.synthdata.apiKey && config.env === 'production') {
    errors.push('SYNTHDATA_API_KEY is required');
  }
  
  if (!config.telegram.botToken) {
    errors.push('TELEGRAM_BOT_TOKEN is required');
  }
  
  if (!config.supabase.url || !config.supabase.serviceKey) {
    errors.push('Supabase credentials are required');
  }
  
  if (errors.length > 0) {
    console.error('❌ Configuration errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    return false;
  }
  
  return true;
}
