'use client';
import { useEffect, useState } from 'react';
import { HeatItem } from '@/app/heats/types';
import { useRaceStore } from '../store/useRaceStore';
import { useLinkedHeatStore } from './useLinkedHeatStore';
import * as api from './linkedHeatClient';

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

interface Props {
  open: boolean;
  onClose: () => void;
  isViewer: boolean;
}

const PAGE_SIZE = 20;

export function LinkedHeatModal({ open, onClose, isViewer }: Props) {
  const linkedHeatId = useRaceStore((s) => s.raceData?.linkedHeatId ?? null);
  const { heat, firstLapByKart, isLoading, notFound, setLink, importTeams } = useLinkedHeatStore();

  const [kartodroms, setKartodroms] = useState<string[]>([]);
  const [activeKartodrom, setActiveKartodrom] = useState<string>('');
  const [page, setPage] = useState(1);
  const [heats, setHeats] = useState<HeatItem[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [importToast, setImportToast] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setListError(null);
    api
      .listKartodroms()
      .then((ids) => {
        setKartodroms(ids);
        if (ids.length && !activeKartodrom) setActiveKartodrom(ids[0]);
      })
      .catch((e) => setListError((e as Error).message));
  }, [open, activeKartodrom]);

  useEffect(() => {
    if (!open || !activeKartodrom) return;
    setListLoading(true);
    api
      .listHeats({ kartodromId: activeKartodrom, page, limit: PAGE_SIZE })
      .then(({ data, total }) => {
        setHeats(data);
        setTotal(total);
      })
      .catch((e) => setListError((e as Error).message))
      .finally(() => setListLoading(false));
  }, [open, activeKartodrom, page]);

  if (!open) return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleLink = async (id: string) => {
    if (isViewer) return;
    await setLink(id);
  };

  const handleUnlink = async () => {
    if (isViewer) return;
    await setLink(null);
  };

  const handleImport = () => {
    if (isViewer) return;
    const { added, skipped } = importTeams();
    setImportToast(`Imported ${added} team${added === 1 ? '' : 's'} (${skipped} skipped)`);
    setTimeout(() => setImportToast(null), 3000);
  };

  const importCount = firstLapByKart.size;
  const existingKarts = new Set(useRaceStore.getState().raceData?.teams.map((t) => t.startKart) ?? []);
  const willAdd = Array.from(firstLapByKart.values()).filter((lap) => !existingKarts.has(lap.kart)).length;
  const willSkip = importCount - willAdd;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[640px] max-w-[94vw] rounded-2xl border border-white/10 bg-[#0a0a0f] p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-white text-sm font-bold uppercase tracking-wide">Linked heat</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {linkedHeatId && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-950/30 p-4 space-y-3">
            {notFound ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-red-300 text-sm">🔗 Linked heat not found ({linkedHeatId.slice(0, 8)}…)</span>
                <button
                  onClick={handleUnlink}
                  disabled={isViewer}
                  className="px-3 py-1 rounded-md border border-white/10 text-gray-300 text-xs hover:bg-white/[0.04] disabled:opacity-50"
                >
                  Unlink
                </button>
              </div>
            ) : heat ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium truncate">🔗 {heat.name}</div>
                    <div className="text-gray-500 text-[11px] font-mono">
                      {kartodromLabel(heat.kartodromId)} · {heat.status}
                    </div>
                  </div>
                  <button
                    onClick={handleUnlink}
                    disabled={isViewer}
                    className="px-3 py-1 rounded-md border border-white/10 text-gray-300 text-xs hover:bg-white/[0.04] disabled:opacity-50"
                  >
                    Unlink
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={handleImport}
                    disabled={isViewer || importCount === 0}
                    className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Import teams + start karts
                    {importCount > 0 && (
                      <span className="ml-2 text-emerald-200/80 text-[10px]">
                        (adds {willAdd}, skips {willSkip})
                      </span>
                    )}
                    {importCount === 0 && (
                      <span className="ml-2 text-emerald-200/60 text-[10px]">(no laps yet)</span>
                    )}
                  </button>
                  {importToast && <span className="text-emerald-300 text-xs">{importToast}</span>}
                </div>
              </>
            ) : (
              <div className="text-gray-500 text-xs">{isLoading ? 'Loading…' : ''}</div>
            )}
          </div>
        )}

        {listError && <div className="text-red-400 text-xs">{listError}</div>}

        <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06] w-fit flex-wrap">
          {kartodroms.map((id) => (
            <button
              key={id}
              onClick={() => {
                setActiveKartodrom(id);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-md text-[11px] font-medium ${
                activeKartodrom === id ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {kartodromLabel(id)}
            </button>
          ))}
        </div>

        <div className="space-y-2 max-h-[360px] overflow-y-auto">
          {listLoading && <div className="text-gray-500 text-xs">Loading…</div>}
          {!listLoading && heats.length === 0 && (
            <div className="text-gray-600 text-xs uppercase tracking-[3px] text-center py-8">
              No heats
            </div>
          )}
          {heats.map((h) => {
            const isLinked = h.id === linkedHeatId;
            return (
              <div
                key={h.id}
                className="flex items-center justify-between gap-3 border border-white/10 rounded-lg px-4 py-2"
              >
                <div className="min-w-0">
                  <div className="text-white text-sm truncate">{h.name}</div>
                  <div className="text-gray-600 text-[11px] font-mono">
                    {h.status} · {new Date(h.createdAt).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => handleLink(h.id)}
                  disabled={isViewer || isLinked}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                    isLinked
                      ? 'bg-orange-500/30 text-orange-200 cursor-default'
                      : 'bg-orange-500/80 text-black hover:bg-orange-400'
                  } disabled:opacity-50`}
                >
                  {isLinked ? 'Linked' : 'Link'}
                </button>
              </div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1 rounded-lg text-xs font-medium border border-white/10 text-gray-400 hover:bg-white/[0.04] disabled:opacity-30"
            >
              ←
            </button>
            <span className="text-gray-500 text-xs font-mono">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1 rounded-lg text-xs font-medium border border-white/10 text-gray-400 hover:bg-white/[0.04] disabled:opacity-30"
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
