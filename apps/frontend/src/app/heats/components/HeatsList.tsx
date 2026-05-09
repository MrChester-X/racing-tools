'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useHeatsStore } from '../store/useHeatsStore';
import { ImportRaceModal } from './ImportRaceModal';

const KARTODROM_LABELS: Record<string, string> = {
  'pitstop-premium': 'PitStop Premium',
  'pitstop-narvskaya': 'PitStop Narvskaya',
};

function kartodromLabel(id: string): string {
  if (KARTODROM_LABELS[id]) return KARTODROM_LABELS[id];
  return id
    .split(/[-_]/)
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const statusConfig: Record<string, { dot: string; label: string; border: string; bg: string }> = {
  waiting: { dot: 'bg-yellow-400', label: 'Waiting', border: 'border-yellow-500/10', bg: 'bg-yellow-500/[0.03]' },
  inProgress: { dot: 'bg-blue-400 animate-pulse', label: 'In Progress', border: 'border-blue-500/10', bg: 'bg-blue-500/[0.03]' },
  finished: { dot: 'bg-green-400', label: 'Finished', border: 'border-green-500/10', bg: 'bg-green-500/[0.03]' },
  unknown: { dot: 'bg-gray-400', label: 'Unknown', border: 'border-white/[0.06]', bg: 'bg-white/[0.02]' },
};

function formatTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(3);
  return min > 0 ? `${min}:${sec.padStart(6, '0')}` : `${sec}`;
}

export function HeatsList() {
  const { heats, heatsTotal, heatsPage, heatsLimit, kartodromId, kartodromOptions, isLoading, loadHeats, loadKartodroms, setHeatsPage, setKartodromId, subscribe, unsubscribe } = useHeatsStore();
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadKartodroms();
      if (!mounted) return;
      await loadHeats();
      if (!mounted) return;
      subscribe();
    })();
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [loadHeats, loadKartodroms, subscribe, unsubscribe]);

  const totalPages = Math.max(1, Math.ceil(heatsTotal / heatsLimit));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-gradient-to-b from-orange-500 to-amber-600 rounded-full" />
          <h2 className="text-lg font-bold text-white tracking-wide uppercase">Heats</h2>
        </div>
        <div className="flex items-center gap-3">
          {isLoading && <div className="w-3 h-3 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />}
          <span className="text-gray-600 text-xs">{heatsTotal} heats</span>
          <button
            onClick={() => setImportOpen(true)}
            className="px-3 py-1 rounded-md border border-white/10 text-gray-300 text-[11px] font-medium hover:text-white hover:bg-white/[0.04]"
          >
            + Import race
          </button>
        </div>
      </div>

      {/* Kartodrom Filter */}
      {kartodromOptions.length > 0 && (
        <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06] w-fit flex-wrap">
          {kartodromOptions.map((id) => (
            <button
              key={id}
              onClick={() => setKartodromId(id)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium tracking-wide transition-all ${
                kartodromId === id ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {kartodromLabel(id)}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {heats.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-gray-800 text-xs uppercase tracking-[4px]">No heats found</div>
        </div>
      ) : (
        <div className="space-y-2">
          {heats.map((heat) => {
            const cfg = statusConfig[heat.status] || statusConfig.unknown;
            return (
              <div
                key={heat.id}
                onClick={() => router.push(`/heats/${heat.id}`)}
                className={`border ${cfg.border} ${cfg.bg} rounded-xl px-5 py-4 cursor-pointer hover:bg-white/[0.03] transition-all group`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-medium truncate">{heat.name}</span>
                        <span className="text-gray-600 text-xs shrink-0">{cfg.label}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-gray-700 text-[11px] font-mono">
                          {new Date(heat.createdAt).toLocaleString()}
                        </span>
                        {heat.meta.type && (
                          <span className="text-gray-600 text-[11px] font-mono uppercase">{heat.meta.type}</span>
                        )}
                        {heat.meta.totalLaps != null && heat.meta.totalLaps > 0 && (
                          <span className="text-gray-600 text-[11px] font-mono">{heat.meta.totalLaps} laps</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="text-gray-700 group-hover:text-gray-500 transition-colors shrink-0">→</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setHeatsPage(heatsPage - 1)}
            disabled={heatsPage <= 1}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              heatsPage <= 1
                ? 'border-white/[0.04] text-gray-700 cursor-not-allowed'
                : 'border-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            ←
          </button>
          <span className="text-gray-500 text-xs font-mono">
            {heatsPage} / {totalPages}
          </span>
          <button
            onClick={() => setHeatsPage(heatsPage + 1)}
            disabled={heatsPage >= totalPages}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              heatsPage >= totalPages
                ? 'border-white/[0.04] text-gray-700 cursor-not-allowed'
                : 'border-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            →
          </button>
        </div>
      )}

      <ImportRaceModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
