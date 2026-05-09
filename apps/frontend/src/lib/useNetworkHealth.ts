'use client';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type RealtimeState = 'OPEN' | 'CONNECTING' | 'CLOSING' | 'CLOSED';

export interface NetworkHealth {
  /** Browser-reported network state (navigator.onLine + online/offline events). */
  browserOnline: boolean;
  /** Supabase realtime websocket state. */
  realtimeState: RealtimeState;
  /** True when both browser is online AND realtime websocket is open. */
  healthy: boolean;
}

const REALTIME_POLL_MS = 1_000;
const REALTIME_FORCE_RECONNECT_AFTER_MS = 15_000;

function readRealtimeState(): RealtimeState {
  const rt = supabase.realtime as unknown as { connectionState?: () => string };
  const raw = rt.connectionState?.();
  switch (String(raw ?? '').toUpperCase()) {
    case 'OPEN':
      return 'OPEN';
    case 'CONNECTING':
      return 'CONNECTING';
    case 'CLOSING':
      return 'CLOSING';
    case 'CLOSED':
      return 'CLOSED';
    default:
      return 'CLOSED';
  }
}

/**
 * Tracks browser online/offline and supabase realtime websocket state.
 * Forces supabase to reconnect when:
 *   - browser fires `online` (don't wait for built-in retry timer)
 *   - realtime stays CLOSED for too long while browser is online
 */
export function useNetworkHealth(): NetworkHealth {
  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [realtimeState, setRealtimeState] = useState<RealtimeState>(() => readRealtimeState());

  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      forceReconnect('browser online');
    };
    const handleOffline = () => setBrowserOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let closedSince: number | null = null;
    const tick = () => {
      const next = readRealtimeState();
      setRealtimeState(next);

      if (!navigator.onLine) {
        closedSince = null;
        return;
      }
      if (next === 'OPEN' || next === 'CONNECTING') {
        closedSince = null;
        return;
      }
      // realtime is CLOSED/CLOSING but the browser claims to be online —
      // give built-in reconnect a chance, then force.
      const now = Date.now();
      if (closedSince === null) {
        closedSince = now;
        return;
      }
      if (now - closedSince > REALTIME_FORCE_RECONNECT_AFTER_MS) {
        closedSince = null;
        forceReconnect('realtime stuck closed');
      }
    };
    const id = setInterval(tick, REALTIME_POLL_MS);
    return () => clearInterval(id);
  }, []);

  return {
    browserOnline,
    realtimeState,
    healthy: browserOnline && realtimeState === 'OPEN',
  };
}

function forceReconnect(reason: string): void {
  try {
    const rt = supabase.realtime as unknown as {
      disconnect?: () => void;
      connect?: () => void;
    };
    rt.disconnect?.();
    rt.connect?.();
    if (typeof console !== 'undefined') {
      console.info(`[realtime] forced reconnect: ${reason}`);
    }
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn(`[realtime] forceReconnect failed: ${String(err)}`);
    }
  }
}
