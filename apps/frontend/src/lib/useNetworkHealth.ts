'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export type RealtimeState = 'OPEN' | 'CONNECTING' | 'CLOSING' | 'CLOSED';

export interface NetworkHealth {
  /** Browser-reported network state (navigator.onLine + online/offline events). */
  browserOnline: boolean;
  /** Last active probe to supabase succeeded. */
  probeOk: boolean;
  /** Supabase realtime websocket state. */
  realtimeState: RealtimeState;
  /** True only when browser is online, probe is succeeding, and realtime ws is open. */
  healthy: boolean;
}

const PROBE_INTERVAL_MS = 5_000;
const PROBE_TIMEOUT_MS = 4_000;
const PROBE_FAILS_BEFORE_OFFLINE = 2;
const REALTIME_POLL_MS = 1_000;
const REALTIME_FORCE_RECONNECT_AFTER_MS = 10_000;

const PROBE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/`
  : null;
const PROBE_APIKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

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

async function probe(): Promise<boolean> {
  if (!PROBE_URL) return true;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(PROBE_URL, {
      method: 'GET',
      cache: 'no-store',
      headers: PROBE_APIKEY ? { apikey: PROBE_APIKEY } : undefined,
      signal: ctrl.signal,
    });
    // Any HTTP response (including 4xx) means the server is reachable.
    // Only network failures, timeouts, and CORS errors throw — those count as offline.
    return res.status > 0 && res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
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

/**
 * Robust network health detector that doesn't trust navigator.onLine or
 * supabase.realtime.connectionState() alone — both can claim "OK" while the
 * underlying connection is dead.
 *
 * Strategy:
 *  - Active probe (GET /auth/v1/health) every 5s with 4s timeout
 *  - 2 consecutive failures → treat as offline, force realtime reconnect
 *  - 1 success after a failure → force reconnect immediately to recover state
 *  - On browser `online` event → force reconnect (don't wait for retry timer)
 *  - Realtime state polled separately for UI; if reported OPEN but probe says
 *    dead, we still force reconnect since the WS is half-open
 */
export function useNetworkHealth(): NetworkHealth {
  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [probeOk, setProbeOk] = useState<boolean>(true);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>(() => readRealtimeState());

  const probeFailsRef = useRef(0);
  const lastProbeOkRef = useRef(true);

  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      forceReconnect('browser online');
      void runProbe();
    };
    const handleOffline = () => {
      setBrowserOnline(false);
      setProbeOk(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // runProbe is defined below — referenced via stable closure via state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Probe loop
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      const ok = await probe();
      if (stopped) return;
      handleProbeResult(ok);
    };

    const handleProbeResult = (ok: boolean) => {
      const wasOk = lastProbeOkRef.current;
      lastProbeOkRef.current = ok;

      if (ok) {
        probeFailsRef.current = 0;
        if (!wasOk) {
          // recovered — force reconnect to flush stuck channels
          forceReconnect('probe recovered');
        }
        setProbeOk(true);
        return;
      }

      probeFailsRef.current++;
      if (probeFailsRef.current >= PROBE_FAILS_BEFORE_OFFLINE) {
        if (wasOk) {
          // first transition to "offline" — force reconnect so realtime
          // doesn't sit on a half-open ws
          forceReconnect('probe failed');
        }
        setProbeOk(false);
      }
    };

    void tick();
    const id = setInterval(tick, PROBE_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  // Realtime state poll (UI display + stuck-closed watchdog)
  useEffect(() => {
    let closedSince: number | null = null;
    const id = setInterval(() => {
      const next = readRealtimeState();
      setRealtimeState(next);

      if (!navigator.onLine || !lastProbeOkRef.current) {
        closedSince = null;
        return;
      }
      if (next === 'OPEN' || next === 'CONNECTING') {
        closedSince = null;
        return;
      }
      const now = Date.now();
      if (closedSince === null) {
        closedSince = now;
        return;
      }
      if (now - closedSince > REALTIME_FORCE_RECONNECT_AFTER_MS) {
        closedSince = null;
        forceReconnect('realtime stuck closed');
      }
    }, REALTIME_POLL_MS);
    return () => clearInterval(id);
  }, []);

  return {
    browserOnline,
    probeOk,
    realtimeState,
    healthy: browserOnline && probeOk && realtimeState === 'OPEN',
  };
}

// Trigger a probe-on-demand (used by online event handler)
async function runProbe(): Promise<void> {
  await probe();
}
