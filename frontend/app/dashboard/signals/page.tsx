'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client (use your env vars)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface Signal {
  id: string;
  timestamp: string;
  asset: string;
  direction: 'UP' | 'DOWN';
  synth_prob: number;
  poly_prob: number;
  edge: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  polymarket_url: string;
  alerted: boolean;
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [filter]);

  async function fetchSignals() {
    try {
      const since = new Date();
      since.setHours(since.getHours() - 24);

      let query = supabase
        .from('synth_signals')
        .select('*')
        .gte('timestamp', since.toISOString())
        .order('timestamp', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('asset', filter);
      }

      const { data, error } = await query;

      if (error) throw error;

      setSignals(data || []);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching signals:', error);
    } finally {
      setLoading(false);
    }
  }

  function getConfidenceColor(confidence: string) {
    switch (confidence) {
      case 'HIGH': return 'text-green-400';
      case 'MEDIUM': return 'text-yellow-400';
      case 'LOW': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  }

  function getConfidenceEmoji(confidence: string) {
    switch (confidence) {
      case 'HIGH': return '🔥🔥🔥';
      case 'MEDIUM': return '🔥🔥';
      case 'LOW': return '🔥';
      default: return '❓';
    }
  }

  const alertedCount = signals.filter(s => s.alerted).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🚨 SynthSignals Dashboard
          </h1>
          <p className="text-gray-400">
            Real-time Polymarket edge detection powered by Synthdata AI
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
            <div className="text-gray-400 text-sm mb-1">Total Signals (24h)</div>
            <div className="text-3xl font-bold text-white">{signals.length}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
            <div className="text-gray-400 text-sm mb-1">Alerts Sent</div>
            <div className="text-3xl font-bold text-green-400">{alertedCount}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
            <div className="text-gray-400 text-sm mb-1">Last Update</div>
            <div className="text-lg font-semibold text-white">
              {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
            <div className="text-gray-400 text-sm mb-1">Status</div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-lg font-semibold text-white">Active</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex gap-4 items-center">
          <span className="text-gray-400">Filter by asset:</span>
          <div className="flex gap-2">
            {['all', 'BTC', 'ETH', 'SOL'].map((asset) => (
              <button
                key={asset}
                onClick={() => setFilter(asset)}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  filter === asset
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-gray-400 hover:bg-white/20'
                }`}
              >
                {asset === 'all' ? 'All' : asset}
              </button>
            ))}
          </div>
        </div>

        {/* Subscribe Button */}
        <div className="mb-8 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg p-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white mb-2">
                Get Alerts on Telegram
              </h3>
              <p className="text-gray-200">
                Never miss a high-edge opportunity. Subscribe to instant alerts.
              </p>
            </div>
            <a
              href="https://t.me/YOUR_BOT_USERNAME"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-purple-600 px-6 py-3 rounded-lg font-bold hover:bg-gray-100 transition-all"
            >
              Subscribe Now
            </a>
          </div>
        </div>

        {/* Signals Table */}
        <div className="bg-white/10 backdrop-blur-lg rounded-lg border border-white/20 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="text-left p-4 text-gray-400 font-semibold">Time</th>
                  <th className="text-left p-4 text-gray-400 font-semibold">Asset</th>
                  <th className="text-left p-4 text-gray-400 font-semibold">Direction</th>
                  <th className="text-left p-4 text-gray-400 font-semibold">Edge</th>
                  <th className="text-left p-4 text-gray-400 font-semibold">Synthdata</th>
                  <th className="text-left p-4 text-gray-400 font-semibold">Polymarket</th>
                  <th className="text-left p-4 text-gray-400 font-semibold">Confidence</th>
                  <th className="text-left p-4 text-gray-400 font-semibold">Alerted</th>
                  <th className="text-left p-4 text-gray-400 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center p-8 text-gray-400">
                      Loading signals...
                    </td>
                  </tr>
                ) : signals.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center p-8 text-gray-400">
                      No signals in the last 24 hours
                    </td>
                  </tr>
                ) : (
                  signals.map((signal) => (
                    <tr key={signal.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="p-4 text-gray-300">
                        {new Date(signal.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="p-4 text-white font-bold">{signal.asset}</td>
                      <td className="p-4">
                        <span className={`font-semibold ${signal.direction === 'UP' ? 'text-green-400' : 'text-red-400'}`}>
                          {signal.direction} {signal.direction === 'UP' ? '⬆️' : '⬇️'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`font-bold ${signal.edge > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {signal.edge > 0 ? '+' : ''}{signal.edge.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-4 text-gray-300">{signal.synth_prob.toFixed(1)}%</td>
                      <td className="p-4 text-gray-300">{signal.poly_prob.toFixed(1)}%</td>
                      <td className="p-4">
                        <span className={`font-semibold ${getConfidenceColor(signal.confidence)}`}>
                          {getConfidenceEmoji(signal.confidence)} {signal.confidence}
                        </span>
                      </td>
                      <td className="p-4">
                        {signal.alerted ? (
                          <span className="text-green-400">✅</span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        <a
                          href={signal.polymarket_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 font-semibold"
                        >
                          Trade →
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
