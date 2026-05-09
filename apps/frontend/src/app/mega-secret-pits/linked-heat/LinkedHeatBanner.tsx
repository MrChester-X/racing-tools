'use client';
import { useRaceStore } from '../store/useRaceStore';
import { useLinkedHeatStore } from './useLinkedHeatStore';

interface Props {
  isViewer: boolean;
}

export function LinkedHeatBanner({ isViewer }: Props) {
  const linkedHeatId = useRaceStore((s) => s.raceData?.linkedHeatId ?? null);
  const { heat, notFound, setLink } = useLinkedHeatStore();

  if (!linkedHeatId) return null;

  const handleUnlink = async () => {
    if (isViewer) return;
    await setLink(null);
  };

  return (
    <div className="relative z-20 bg-gradient-to-r from-cyan-950/40 to-blue-950/40 border-b border-cyan-500/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-3 text-xs">
        {notFound ? (
          <span className="text-red-300">🔗 Linked heat not found ({linkedHeatId.slice(0, 8)}…)</span>
        ) : heat ? (
          <>
            <span className="text-cyan-200 font-bold uppercase tracking-wider">
              🔗 Linked: {heat.name}
            </span>
            <span className="text-gray-500">·</span>
            <span className="text-gray-400">{heat.kartodromId}</span>
            <a
              href={`/heats/${heat.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-300 hover:text-cyan-200 underline-offset-2 hover:underline"
            >
              open ↗
            </a>
          </>
        ) : (
          <span className="text-gray-400">🔗 Loading linked heat…</span>
        )}
        <div className="flex-1" />
        <button
          onClick={handleUnlink}
          disabled={isViewer}
          className="px-2 py-0.5 rounded border border-white/10 text-gray-300 text-[11px] font-medium hover:bg-white/[0.04] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Unlink
        </button>
      </div>
    </div>
  );
}
