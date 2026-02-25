"use client";

import { useState, useEffect } from "react";

interface Strategy {
  name: string;
  edge_threshold: number;
  confidence_threshold: number;
  position_size: number;
  timeframe: string;
  asset: string;
}

interface StrategyBuilderProps {
  onBacktest: (params: {
    strategy_name?: string;
    custom_params?: any;
    days_back: number;
    asset: string;
  }) => void;
  isLoading: boolean;
}

export function StrategyBuilder({ onBacktest, isLoading }: StrategyBuilderProps) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<string>("Gopfan2 Strategy");
  const [customMode, setCustomMode] = useState(false);
  
  // Custom parameters
  const [edgeThreshold, setEdgeThreshold] = useState(15);
  const [confidenceThreshold, setConfidenceThreshold] = useState(75);
  const [positionSize, setPositionSize] = useState(100);
  const [timeframe, setTimeframe] = useState("1h");
  const [asset, setAsset] = useState("BTC");
  const [daysBack, setDaysBack] = useState(30);

  // Fetch available strategies
  useEffect(() => {
    fetch("/api/strategies")
      .then((res) => res.json())
      .then((data) => {
        if (data.strategies) {
          setStrategies(data.strategies);
        }
      })
      .catch((err) => console.error("Failed to fetch strategies:", err));
  }, []);

  const handleRunBacktest = () => {
    if (customMode) {
      onBacktest({
        custom_params: {
          name: "Custom Strategy",
          edge_threshold: edgeThreshold / 100,
          confidence_threshold: confidenceThreshold / 100,
          position_size: positionSize,
          timeframe,
          asset,
        },
        days_back: daysBack,
        asset,
      });
    } else {
      onBacktest({
        strategy_name: selectedStrategy,
        days_back: daysBack,
        asset,
      });
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h2 className="text-2xl font-bold text-foreground mb-6">Build Your Strategy</h2>

      {/* Mode Toggle */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setCustomMode(false)}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            !customMode
              ? "bg-ep-green text-black"
              : "bg-card-muted text-text-muted hover:bg-card-hover"
          }`}
        >
          Pre-Built Strategies
        </button>
        <button
          onClick={() => setCustomMode(true)}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            customMode
              ? "bg-ep-green text-black"
              : "bg-card-muted text-text-muted hover:bg-card-hover"
          }`}
        >
          Custom Parameters
        </button>
      </div>

      {/* Pre-Built Strategy Selector */}
      {!customMode && (
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Select Strategy
            </label>
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              className="w-full bg-card-muted border border-border rounded-lg px-4 py-2 text-foreground"
            >
              {strategies.map((strategy) => (
                <option key={strategy.name} value={strategy.name}>
                  {strategy.name}
                </option>
              ))}
            </select>
          </div>

          {/* Show selected strategy details */}
          {strategies.find((s) => s.name === selectedStrategy) && (
            <div className="bg-card-muted border border-border rounded-lg p-4 space-y-2 text-sm">
              <h3 className="font-medium text-foreground mb-2">Strategy Details:</h3>
              {(() => {
                const strategy = strategies.find((s) => s.name === selectedStrategy)!;
                return (
                  <>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Edge Threshold:</span>
                      <span className="font-medium text-foreground">
                        {(strategy.edge_threshold * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Confidence:</span>
                      <span className="font-medium text-foreground">
                        {(strategy.confidence_threshold * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Position Size:</span>
                      <span className="font-medium text-foreground">
                        ${strategy.position_size}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Timeframe:</span>
                      <span className="font-medium text-foreground">{strategy.timeframe}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Custom Parameters */}
      {customMode && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Edge Threshold */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Edge Threshold: {edgeThreshold}%
            </label>
            <input
              type="range"
              min="5"
              max="30"
              step="1"
              value={edgeThreshold}
              onChange={(e) => setEdgeThreshold(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-text-muted mt-1">
              Minimum edge required to take a trade
            </p>
          </div>

          {/* Confidence Threshold */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Confidence: {confidenceThreshold}%
            </label>
            <input
              type="range"
              min="50"
              max="95"
              step="5"
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-text-muted mt-1">Minimum prediction confidence</p>
          </div>

          {/* Position Size */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Position Size: ${positionSize}
            </label>
            <input
              type="range"
              min="25"
              max="500"
              step="25"
              value={positionSize}
              onChange={(e) => setPositionSize(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-text-muted mt-1">Amount per trade</p>
          </div>

          {/* Timeframe */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full bg-card-muted border border-border rounded-lg px-4 py-2 text-foreground"
            >
              <option value="1h">1 Hour</option>
              <option value="24h">24 Hours</option>
            </select>
          </div>
        </div>
      )}

      {/* Common Parameters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Asset Selector */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-2">Asset</label>
          <select
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            className="w-full bg-card-muted border border-border rounded-lg px-4 py-2 text-foreground"
          >
            <option value="BTC">Bitcoin (BTC)</option>
            <option value="ETH">Ethereum (ETH)</option>
            <option value="SOL">Solana (SOL)</option>
            <option value="NVDA">NVIDIA (NVDA)</option>
            <option value="TSLA">Tesla (TSLA)</option>
          </select>
        </div>

        {/* Days Back */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-2">
            Backtest Period: {daysBack} days
          </label>
          <input
            type="range"
            min="7"
            max="90"
            step="1"
            value={daysBack}
            onChange={(e) => setDaysBack(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-text-muted mt-1">Historical data to analyze</p>
        </div>
      </div>

      {/* Run Backtest Button */}
      <button
        onClick={handleRunBacktest}
        disabled={isLoading}
        className={`w-full py-3 rounded-lg font-bold text-lg transition-all ${
          isLoading
            ? "bg-card-muted text-text-muted cursor-not-allowed"
            : "bg-ep-green text-black hover:bg-ep-green/90 hover:scale-[1.02]"
        }`}
      >
        {isLoading ? "Running Backtest..." : "🚀 Run Backtest"}
      </button>
    </div>
  );
}
