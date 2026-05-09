'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { HeatItem, HeatDetail, LapItem } from '../types';

function formatTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(3);
  return min > 0 ? `${min}:${sec.padStart(6, '0')}` : sec;
}

interface DriverColumn {
  driverExternalId: number;
  name: string;
  kart: string;
  bestTime: number;
  lapsByCount: Map<number, LapItem>;
}

export default function HeatPage() {
  const { id } = useParams<{ id: string }>();
  const [heat, setHeat] = useState<HeatDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredDriver, setHoveredDriver] = useState<number | null>(null);
  const [hoveredLap, setHoveredLap] = useState<number | null>(null);
  const [lapOrder, setLapOrder] = useState<'asc' | 'desc'>('desc');

  const fetchLaps = useCallback(async (): Promise<LapItem[]> => {
    const PAGE_SIZE = 1000;
    const all: LapItem[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('laps')
        .select('*')
        .eq('heatId', id)
        .order('lapCount', { ascending: true })
        .order('position', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const chunk = (data ?? []) as LapItem[];
      all.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
    }
    return all;
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [{ data: heatData, error: heatErr }, laps] = await Promise.all([
        supabase.from('heats').select('*').eq('id', id).single(),
        fetchLaps(),
      ]);
      if (heatErr) throw heatErr;
      if (cancelled) return;
      setHeat({ ...(heatData as HeatItem), laps });
      setIsLoading(false);
    };

    load();

    const channel = supabase
      .channel(`heat:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'heats', filter: `id=eq.${id}` },
        (payload) => {
          if (cancelled) return;
          setHeat((prev) => (prev ? { ...prev, ...(payload.new as HeatItem) } : prev));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'laps', filter: `heatId=eq.${id}` },
        async () => {
          if (cancelled) return;
          const laps = await fetchLaps();
          if (cancelled) return;
          setHeat((prev) => (prev ? { ...prev, laps } : prev));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [id, fetchLaps]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!heat) return null;

  // Build driver columns and find max lap count
  const driversMap = new Map<number, DriverColumn>();
  let maxLap = 0;
  let absoluteBest = Infinity;

  for (const lap of heat.laps) {
    if (!driversMap.has(lap.driverExternalId)) {
      driversMap.set(lap.driverExternalId, {
        driverExternalId: lap.driverExternalId,
        name: lap.driverName,
        kart: lap.kart,
        bestTime: Infinity,
        lapsByCount: new Map(),
      });
    }
    const driver = driversMap.get(lap.driverExternalId)!;
    driver.lapsByCount.set(lap.lapCount, lap);
    if (lap.time < driver.bestTime) {
      driver.bestTime = lap.time;
    }
    if (lap.time < absoluteBest) {
      absoluteBest = lap.time;
    }
    if (lap.lapCount > maxLap) {
      maxLap = lap.lapCount;
    }
  }

  const drivers = Array.from(driversMap.values());
  drivers.sort((a, b) => {
    const aLastLap = a.lapsByCount.get(maxLap);
    const bLastLap = b.lapsByCount.get(maxLap);
    return (aLastLap?.position ?? 999) - (bLastLap?.position ?? 999);
  });

  const lapNumbers = lapOrder === 'asc'
    ? Array.from({ length: maxLap }, (_, i) => i + 1)
    : Array.from({ length: maxLap }, (_, i) => maxLap - i);

  return (
    <div className="min-h-screen p-8 max-w-[95vw] mx-auto">
      {/* Header */}
      <div className="mb-3">
        <Link href="/heats" className="text-gray-600 hover:text-gray-400 text-xs uppercase tracking-wider transition-colors">
          ← Back to heats
        </Link>
        <h1 className="text-white text-xl font-bold mt-3">{heat.name}</h1>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-gray-600 text-xs font-mono">{heat.kartodromId}</span>
          <span className="text-gray-700 text-xs font-mono">{new Date(heat.createdAt).toLocaleString()}</span>
          {heat.meta.type && <span className="text-gray-600 text-[11px] font-mono uppercase">{heat.meta.type}</span>}
        </div>
      </div>

      {/* Order toggle */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06]">
          <button
            onClick={() => setLapOrder('asc')}
            className={`px-3 py-1 rounded-md text-[11px] font-medium tracking-wide transition-all ${
              lapOrder === 'asc' ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            From start
          </button>
          <button
            onClick={() => setLapOrder('desc')}
            className={`px-3 py-1 rounded-md text-[11px] font-medium tracking-wide transition-all ${
              lapOrder === 'desc' ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            From end
          </button>
        </div>
      </div>

      {/* Laps table */}
      <div className="overflow-x-auto rounded-xl border border-white/10 w-fit">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="px-1.5 py-1 text-left text-[10px] text-gray-500 font-medium uppercase tracking-wider border-r border-b border-white/10 sticky left-0 bg-[#0a0a0f] z-10 w-7">
                #
              </th>
              {drivers.map((driver) => {
                const isHovered = hoveredDriver === driver.driverExternalId;
                return (
                  <th
                    key={driver.driverExternalId}
                    className={`px-2 pt-3 pb-1.5 text-center border-r border-b border-white/10 w-[84px] max-w-[84px] cursor-default transition-colors ${
                      isHovered ? 'bg-white/[0.06]' : ''
                    }`}
                    onMouseEnter={() => setHoveredDriver(driver.driverExternalId)}
                    onMouseLeave={() => setHoveredDriver(null)}
                  >
                    <div className={`text-[10px] font-medium leading-tight break-words transition-colors ${
                      isHovered ? 'text-orange-400' : 'text-white'
                    }`}>
                      {driver.name}
                    </div>
                    <div className="text-gray-600 text-[9px] font-mono">{driver.kart}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {lapNumbers.map((lapNum) => {
              const isRowHovered = hoveredLap === lapNum;
              return (
              <tr key={lapNum}>
                <td
                  className={`px-1.5 py-0 text-[10px] font-mono border-r border-b border-white/10 sticky left-0 z-10 text-center cursor-default transition-colors ${
                    isRowHovered ? 'bg-white/[0.06] text-white' : 'bg-[#0a0a0f] text-gray-500'
                  }`}
                  onMouseEnter={() => setHoveredLap(lapNum)}
                  onMouseLeave={() => setHoveredLap(null)}
                >
                  {lapNum}
                </td>
                {drivers.map((driver) => {
                  const lap = driver.lapsByCount.get(lapNum);
                  const isColHovered = hoveredDriver === driver.driverExternalId;
                  const cellHighlight = isColHovered && isRowHovered
                    ? 'bg-white/[0.08]'
                    : isColHovered || isRowHovered
                      ? 'bg-white/[0.04]'
                      : '';
                  if (!lap) {
                    return (
                      <td
                        key={driver.driverExternalId}
                        className={`px-0 py-0 text-center border-r border-b border-white/10 transition-colors ${cellHighlight}`}
                        onMouseEnter={() => { setHoveredDriver(driver.driverExternalId); setHoveredLap(lapNum); }}
                        onMouseLeave={() => { setHoveredDriver(null); setHoveredLap(null); }}
                      >
                        <span className="text-gray-800 text-[10px]">—</span>
                      </td>
                    );
                  }
                  const isAbsoluteBest = lap.time === absoluteBest;
                  const isPersonalBest = lap.time === driver.bestTime;
                  return (
                    <td
                      key={driver.driverExternalId}
                      className={`px-0 py-0 text-center border-r border-b border-white/10 transition-colors ${cellHighlight}`}
                      onMouseEnter={() => { setHoveredDriver(driver.driverExternalId); setHoveredLap(lapNum); }}
                      onMouseLeave={() => { setHoveredDriver(null); setHoveredLap(null); }}
                    >
                      <span
                        className={`block text-[11px] font-mono py-0.5 cursor-default ${
                          isAbsoluteBest
                            ? 'text-purple-400 font-bold'
                            : isPersonalBest
                              ? 'text-green-400 font-bold'
                              : 'text-white/70'
                        }`}
                      >
                        {formatTime(lap.time)}
                      </span>
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
