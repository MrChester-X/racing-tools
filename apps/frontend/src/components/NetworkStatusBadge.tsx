'use client';
import { useEffect, useState } from 'react';
import { useNetworkHealth, type RealtimeState } from '@/lib/useNetworkHealth';

interface BadgeStyle {
  color: string;
  label: string;
  detail: string;
}

function pickStyle(
  browserOnline: boolean,
  probeOk: boolean,
  realtimeState: RealtimeState,
): BadgeStyle {
  if (!browserOnline || !probeOk) {
    return {
      color: '#dc2626',
      label: 'оффлайн',
      detail: !browserOnline
        ? 'Устройство потеряло интернет. Realtime приостановлен.'
        : 'Не достучались до сервера. Возможно соединение нестабильное или провайдер режет.',
    };
  }
  if (realtimeState === 'OPEN') {
    return { color: '#16a34a', label: 'онлайн', detail: 'Интернет и realtime в порядке.' };
  }
  if (realtimeState === 'CONNECTING') {
    return {
      color: '#f59e0b',
      label: 'подключение',
      detail: 'Realtime восстанавливает соединение.',
    };
  }
  return {
    color: '#f59e0b',
    label: 'переподключение',
    detail: 'Realtime отвалился, пробуем восстановить.',
  };
}

export function NetworkStatusBadge() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { browserOnline, probeOk, realtimeState } = useNetworkHealth();
  const [expanded, setExpanded] = useState(false);
  if (!mounted) return null;
  const style = pickStyle(browserOnline, probeOk, realtimeState);

  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onClick={() => setExpanded((v) => !v)}
      role="status"
      aria-live="polite"
      aria-label={`Сеть: ${style.label}`}
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: expanded ? '8px 12px' : '6px 10px',
        borderRadius: 999,
        background: 'rgba(15, 15, 35, 0.92)',
        color: '#e5e7eb',
        fontSize: 12,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        cursor: 'pointer',
        userSelect: 'none',
        backdropFilter: 'blur(8px)',
        transition: 'all 200ms ease',
        maxWidth: expanded ? 320 : 160,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: style.color,
          boxShadow: `0 0 6px ${style.color}`,
          flexShrink: 0,
          animation:
            realtimeState !== 'OPEN' || !browserOnline || !probeOk
              ? 'pulse-dot 1.2s ease-in-out infinite'
              : undefined,
        }}
      />
      <span style={{ whiteSpace: 'nowrap' }}>{style.label}</span>
      {expanded && (
        <span style={{ opacity: 0.75, marginLeft: 4, whiteSpace: 'normal' }}>
          {style.detail}
        </span>
      )}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
