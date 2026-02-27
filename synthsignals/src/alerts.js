import { config } from './config.js';
import { saveSignal, getAlertedSignalsInLastHour, markSignalAsAlerted } from './database.js';

class AlertEngine {
  constructor() {
    this.alertHistory = new Map(); // asset -> last alert timestamp
  }

  async processSignals(signals) {
    const alerts = [];

    for (const signal of signals) {
      // Check if signal meets edge threshold
      if (Math.abs(signal.edge) < config.alerts.edgeThreshold) {
        continue;
      }

      // Check rate limiting
      if (await this.isRateLimited(signal.asset)) {
        console.log(`⏳ Rate limited: ${signal.asset} (max ${config.alerts.maxAlertsPerHourPerAsset}/hour)`);
        continue;
      }

      // Save signal to database
      const savedSignal = await saveSignal(signal);
      
      if (savedSignal) {
        // Mark as alerted
        await markSignalAsAlerted(savedSignal.id);
        
        // Format alert message
        const alertMessage = this.formatAlertMessage(signal);
        
        alerts.push({
          signal,
          message: alertMessage,
          id: savedSignal.id
        });

        // Update rate limiting tracker
        this.updateAlertHistory(signal.asset);
        
        console.log(`🚨 Alert triggered for ${signal.asset}: ${signal.edge.toFixed(1)}% edge`);
      }
    }

    return alerts;
  }

  async isRateLimited(asset) {
    // Check database for recent alerts
    const recentAlerts = await getAlertedSignalsInLastHour(asset);
    return recentAlerts.length >= config.alerts.maxAlertsPerHourPerAsset;
  }

  updateAlertHistory(asset) {
    this.alertHistory.set(asset, Date.now());
  }

  formatAlertMessage(signal) {
    const directionEmoji = signal.direction === 'UP' ? '⬆️' : '⬇️';
    const confidenceEmoji = this.getConfidenceEmoji(signal.confidence);
    const edgeFormatted = signal.edge > 0 ? `+${signal.edge.toFixed(1)}%` : `${signal.edge.toFixed(1)}%`;
    
    const time = new Date().toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });

    return `🚨 *HIGH EDGE DETECTED*

*Asset:* ${signal.asset}
*Direction:* ${signal.direction} ${directionEmoji}
*Edge:* ${edgeFormatted}

*Synthdata:* ${signal.synthProb.toFixed(1)}% ${signal.direction}
*Polymarket:* ${signal.polyProb.toFixed(1)}% ${signal.direction}

*Confidence:* ${confidenceEmoji} (${signal.confidence})
*Timeframe:* Next hour

🔗 [Trade on Polymarket](${signal.polymarketUrl})
⏰ *Detected:* ${time}`;
  }

  getConfidenceEmoji(confidence) {
    switch (confidence) {
      case 'HIGH':
        return '🔥🔥🔥';
      case 'MEDIUM':
        return '🔥🔥';
      case 'LOW':
        return '🔥';
      default:
        return '❓';
    }
  }

  getStats() {
    return {
      edgeThreshold: config.alerts.edgeThreshold,
      maxAlertsPerHour: config.alerts.maxAlertsPerHourPerAsset,
      recentAlerts: Array.from(this.alertHistory.entries()).map(([asset, timestamp]) => ({
        asset,
        timestamp: new Date(timestamp).toISOString()
      }))
    };
  }
}

export const alertEngine = new AlertEngine();
