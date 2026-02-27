import fetch from 'node-fetch';
import { config } from './config.js';

// Mock data for testing when API key is not available
const MOCK_DATA = {
  BTC: {
    predictions: [
      { direction: 'UP', probability: 0.652, polymarket_probability: 0.467, confidence: 'HIGH' },
      { direction: 'DOWN', probability: 0.348, polymarket_probability: 0.533, confidence: 'MEDIUM' }
    ]
  },
  ETH: {
    predictions: [
      { direction: 'UP', probability: 0.581, polymarket_probability: 0.512, confidence: 'MEDIUM' },
      { direction: 'DOWN', probability: 0.419, polymarket_probability: 0.488, confidence: 'LOW' }
    ]
  },
  SOL: {
    predictions: [
      { direction: 'UP', probability: 0.723, polymarket_probability: 0.556, confidence: 'HIGH' },
      { direction: 'DOWN', probability: 0.277, polymarket_probability: 0.444, confidence: 'LOW' }
    ]
  }
};

class SynthdataMonitor {
  constructor() {
    this.cache = new Map();
    this.lastFetchTime = null;
    this.useMockData = !config.synthdata.apiKey || config.env === 'development';
  }

  async fetchPredictions(asset) {
    if (this.useMockData) {
      console.log(`🧪 Using mock data for ${asset}`);
      return MOCK_DATA[asset] || null;
    }

    const url = `${config.synthdata.apiUrl}${config.synthdata.endpoint}?asset=${asset}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${config.synthdata.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`❌ Synthdata API error for ${asset}: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      this.cache.set(asset, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.error(`❌ Error fetching predictions for ${asset}:`, error.message);
      return null;
    }
  }

  async pollAllAssets() {
    console.log('📊 Polling Synthdata for all assets...');
    const results = [];

    for (const asset of config.synthdata.assets) {
      const data = await this.fetchPredictions(asset);
      
      if (data && data.predictions) {
        for (const prediction of data.predictions) {
          const signal = this.transformToSignal(asset, prediction);
          if (signal) {
            results.push(signal);
          }
        }
      }
      
      // Rate limiting: wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.lastFetchTime = new Date();
    console.log(`✅ Polled ${results.length} signals at ${this.lastFetchTime.toLocaleTimeString()}`);
    
    return results;
  }

  transformToSignal(asset, prediction) {
    const synthProb = prediction.probability * 100;
    const polyProb = prediction.polymarket_probability * 100;
    const edge = synthProb - polyProb;

    // Only return signals with meaningful edge
    if (Math.abs(edge) < 1) {
      return null;
    }

    return {
      timestamp: new Date().toISOString(),
      asset,
      direction: prediction.direction,
      synthProb: parseFloat(synthProb.toFixed(1)),
      polyProb: parseFloat(polyProb.toFixed(1)),
      edge: parseFloat(edge.toFixed(1)),
      confidence: this.calculateConfidence(edge, prediction.confidence),
      polymarketUrl: this.generatePolymarketUrl(asset, prediction.direction)
    };
  }

  calculateConfidence(edge, apiConfidence) {
    const absEdge = Math.abs(edge);
    
    // Combine edge size with API confidence
    if (absEdge >= 20 && apiConfidence === 'HIGH') return 'HIGH';
    if (absEdge >= 15 && apiConfidence !== 'LOW') return 'HIGH';
    if (absEdge >= 10) return 'MEDIUM';
    return 'LOW';
  }

  generatePolymarketUrl(asset, direction) {
    // This would need to be updated with actual Polymarket market IDs
    // For now, generate a search URL
    const query = encodeURIComponent(`${asset} ${direction.toLowerCase()} next hour`);
    return `https://polymarket.com/search?q=${query}`;
  }

  getCachedData(asset) {
    const cached = this.cache.get(asset);
    if (!cached) return null;
    
    // Cache expires after 10 minutes
    if (Date.now() - cached.timestamp > 600000) {
      return null;
    }
    
    return cached.data;
  }

  getStatus() {
    return {
      lastFetchTime: this.lastFetchTime,
      cacheSize: this.cache.size,
      useMockData: this.useMockData,
      assets: config.synthdata.assets
    };
  }
}

export const monitor = new SynthdataMonitor();
