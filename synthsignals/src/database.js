import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

let supabase = null;

export function initDatabase() {
  if (!supabase && config.supabase.url && config.supabase.serviceKey) {
    supabase = createClient(config.supabase.url, config.supabase.serviceKey);
    console.log('✅ Supabase client initialized');
  }
  return supabase;
}

export async function createSignalsTable() {
  const client = initDatabase();
  
  // Table should be created manually in Supabase dashboard with this SQL:
  /*
  CREATE TABLE IF NOT EXISTS synth_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    asset TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('UP', 'DOWN')),
    synth_prob NUMERIC NOT NULL,
    poly_prob NUMERIC NOT NULL,
    edge NUMERIC NOT NULL,
    confidence TEXT NOT NULL CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH')),
    polymarket_url TEXT,
    alerted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
  
  CREATE INDEX IF NOT EXISTS idx_synth_signals_timestamp ON synth_signals(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_synth_signals_asset ON synth_signals(asset);
  CREATE INDEX IF NOT EXISTS idx_synth_signals_alerted ON synth_signals(alerted);
  */
  
  console.log('ℹ️  Create the synth_signals table in Supabase using the SQL in database.js');
}

export async function saveSignal(signal) {
  const client = initDatabase();
  
  const { data, error } = await client
    .from('synth_signals')
    .insert([{
      timestamp: signal.timestamp,
      asset: signal.asset,
      direction: signal.direction,
      synth_prob: signal.synthProb,
      poly_prob: signal.polyProb,
      edge: signal.edge,
      confidence: signal.confidence,
      polymarket_url: signal.polymarketUrl,
      alerted: signal.alerted || false
    }])
    .select();
  
  if (error) {
    console.error('❌ Error saving signal:', error);
    return null;
  }
  
  return data[0];
}

export async function getRecentSignals(hours = 24) {
  const client = initDatabase();
  
  const since = new Date();
  since.setHours(since.getHours() - hours);
  
  const { data, error } = await client
    .from('synth_signals')
    .select('*')
    .gte('timestamp', since.toISOString())
    .order('timestamp', { ascending: false });
  
  if (error) {
    console.error('❌ Error fetching signals:', error);
    return [];
  }
  
  return data;
}

export async function getAlertedSignalsInLastHour(asset) {
  const client = initDatabase();
  
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  
  const { data, error } = await client
    .from('synth_signals')
    .select('*')
    .eq('asset', asset)
    .eq('alerted', true)
    .gte('timestamp', oneHourAgo.toISOString());
  
  if (error) {
    console.error('❌ Error checking recent alerts:', error);
    return [];
  }
  
  return data;
}

export async function markSignalAsAlerted(signalId) {
  const client = initDatabase();
  
  const { data, error } = await client
    .from('synth_signals')
    .update({ alerted: true })
    .eq('id', signalId)
    .select();
  
  if (error) {
    console.error('❌ Error marking signal as alerted:', error);
    return null;
  }
  
  return data[0];
}

// User subscriptions (simple in-memory for now, can move to Supabase later)
const subscribers = new Set();

export function addSubscriber(chatId) {
  subscribers.add(chatId.toString());
  console.log(`✅ Added subscriber: ${chatId}`);
  return subscribers.size;
}

export function removeSubscriber(chatId) {
  const removed = subscribers.delete(chatId.toString());
  if (removed) {
    console.log(`✅ Removed subscriber: ${chatId}`);
  }
  return subscribers.size;
}

export function getSubscribers() {
  return Array.from(subscribers);
}

export function hasSubscribers() {
  return subscribers.size > 0;
}
