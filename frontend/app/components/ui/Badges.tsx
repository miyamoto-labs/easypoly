'use client';

// ── Tier Badge ──────────────────────────────────
const tierConfig: Record<string, { color: string; bg: string; emoji: string }> = {
  micro:   { color: '#A78BFA', bg: 'rgba(167, 139, 250, 0.12)', emoji: '🟣' },
  small:   { color: '#60A5FA', bg: 'rgba(96, 165, 250, 0.12)',  emoji: '🔵' },
  mid:     { color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.12)',  emoji: '🟡' },
  whale:   { color: '#34D399', bg: 'rgba(52, 211, 153, 0.12)',  emoji: '🟢' },
  unknown: { color: '#8B92A8', bg: 'rgba(139, 146, 168, 0.12)', emoji: '⚪' },
};

export function TierBadge({ tier, showEmoji = false }: { tier: string; showEmoji?: boolean }) {
  const config = tierConfig[tier?.toLowerCase()] || tierConfig.unknown;
  return (
    <span
      className="badge"
      style={{ color: config.color, background: config.bg, border: `1px solid ${config.color}20` }}
    >
      {showEmoji && <span className="text-[10px]">{config.emoji}</span>}
      {tier?.toUpperCase() || 'N/A'}
    </span>
  );
}

// ── Style Badge ──────────────────────────────────
const styleConfig: Record<string, { color: string; bg: string; icon: string }> = {
  degen:   { color: '#F472B6', bg: 'rgba(244, 114, 182, 0.12)', icon: '🎰' },
  sniper:  { color: '#F97316', bg: 'rgba(249, 115, 22, 0.12)',  icon: '🎯' },
  grinder: { color: '#818CF8', bg: 'rgba(129, 140, 248, 0.12)', icon: '⚙️' },
  whale:   { color: '#22D3EE', bg: 'rgba(34, 211, 238, 0.12)',  icon: '🐋' },
  unknown: { color: '#8B92A8', bg: 'rgba(139, 146, 168, 0.12)', icon: '❓' },
};

export function StyleBadge({ style, showIcon = false }: { style: string; showIcon?: boolean }) {
  const config = styleConfig[style?.toLowerCase()] || styleConfig.unknown;
  return (
    <span
      className="badge"
      style={{ color: config.color, background: config.bg, border: `1px solid ${config.color}20` }}
    >
      {showIcon && <span className="text-[10px]">{config.icon}</span>}
      {style?.toUpperCase() || 'N/A'}
    </span>
  );
}

// ── Category Badge ───────────────────────────────
const categoryConfig: Record<string, { color: string; bg: string; emoji: string }> = {
  politics: { color: '#60A5FA', bg: 'rgba(96, 165, 250, 0.12)',  emoji: '🏛️' },
  sports:   { color: '#34D399', bg: 'rgba(52, 211, 153, 0.12)',  emoji: '⚽' },
  crypto:   { color: '#F97316', bg: 'rgba(249, 115, 22, 0.12)',  emoji: '₿' },
  culture:  { color: '#F472B6', bg: 'rgba(244, 114, 182, 0.12)', emoji: '🎬' },
  finance:  { color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.12)',  emoji: '💰' },
  mentions: { color: '#A78BFA', bg: 'rgba(167, 139, 250, 0.12)', emoji: '📢' },
};

export function CategoryBadge({ category }: { category: string }) {
  const config = categoryConfig[category?.toLowerCase()];
  if (!config) return null;
  return (
    <span
      className="badge"
      style={{ color: config.color, background: config.bg, border: `1px solid ${config.color}20` }}
    >
      <span className="text-[10px]">{config.emoji}</span>
      {category?.toUpperCase()}
    </span>
  );
}

// ── Status Badge ─────────────────────────────────
const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  active:      { color: '#00F0A0', bg: 'rgba(0, 240, 160, 0.12)', label: 'ACTIVE' },
  won:         { color: '#00F0A0', bg: 'rgba(0, 240, 160, 0.12)', label: 'TARGET HIT' },
  hit_target:  { color: '#00F0A0', bg: 'rgba(0, 240, 160, 0.12)', label: 'TARGET HIT' },
  lost:        { color: '#FF4060', bg: 'rgba(255, 64, 96, 0.12)', label: 'LOST' },
  stopped:     { color: '#F0B000', bg: 'rgba(240, 176, 0, 0.12)', label: 'STOPPED' },
  stopped_out: { color: '#F0B000', bg: 'rgba(240, 176, 0, 0.12)', label: 'STOPPED' },
  expired:     { color: '#8B92A8', bg: 'rgba(139, 146, 168, 0.12)', label: 'EXPIRED' },
};

export function StatusBadge({ status }: { status: string }) {
  const key = status?.toLowerCase();
  const config = statusConfig[key] || statusConfig.expired;
  return (
    <span
      className="badge"
      style={{ color: config.color, background: config.bg, border: `1px solid ${config.color}20` }}
    >
      {key === 'active' && <span className="live-dot mr-0.5" style={{ width: 6, height: 6 }} />}
      {config.label}
    </span>
  );
}

// ── Points Tier Badge ────────────────────────────
const pointsTierConfig: Record<string, { color: string; bg: string; emoji: string }> = {
  diamond: { color: '#00D9FF', bg: 'rgba(0, 217, 255, 0.12)', emoji: '💎' },
  gold:    { color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.12)', emoji: '🏆' },
  silver:  { color: '#C0CFDA', bg: 'rgba(192, 207, 218, 0.12)', emoji: '🥈' },
  bronze:  { color: '#CD7F32', bg: 'rgba(205, 127, 50, 0.12)', emoji: '🥉' },
};

export function PointsTierBadge({ tier }: { tier: string }) {
  const config = pointsTierConfig[tier?.toLowerCase()] || pointsTierConfig.bronze;
  return (
    <span
      className="badge"
      style={{ color: config.color, background: config.bg, border: `1px solid ${config.color}20` }}
    >
      <span className="text-[10px]">{config.emoji}</span>
      {tier?.toUpperCase() || 'BRONZE'}
    </span>
  );
}

// ── Direction Badge ──────────────────────────────
export function DirectionBadge({ direction }: { direction: string }) {
  const isYes = direction?.toUpperCase() === 'YES';
  return (
    <span
      className="badge font-mono"
      style={{
        color: isYes ? '#00F0A0' : '#FF4060',
        background: isYes ? 'rgba(0, 240, 160, 0.12)' : 'rgba(255, 64, 96, 0.12)',
        border: `1px solid ${isYes ? '#00F0A020' : '#FF406020'}`,
      }}
    >
      {isYes ? '▲' : '▼'} {direction?.toUpperCase()}
    </span>
  );
}
