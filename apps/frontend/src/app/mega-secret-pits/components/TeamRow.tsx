import { useMemo, useState } from "react";
import { ParsedRaceTeam } from "@/app/mega-secret-pits/types";
import Kart from "@/app/mega-secret-pits/Kart";
import TrashIcon from "./icons/TrashIcon";
import DeleteTeamModal from "./DeleteTeamModal";
import { useRaceStore } from "../store/useRaceStore";
import { useLinkedHeatStore, selectAbsoluteBest } from "../linked-heat/useLinkedHeatStore";
import { useInProgressLap, formatInProgressElapsed } from "../linked-heat/useInProgressLap";

export type TeamSortDelta = { kind: "time"; value: number } | { kind: "lap"; value: number };

interface TeamRowProps {
  team: ParsedRaceTeam;
  onKartClick?: (kartNumber: string) => void;
  sortDelta?: TeamSortDelta;
}

function SortDeltaBadge({ delta }: { delta: TeamSortDelta }) {
  const text = delta.kind === "lap" ? `+${delta.value}L` : `+${(delta.value / 1000).toFixed(3)}`;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-md border border-cyan-500/30 bg-cyan-950/30 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-cyan-300"
      title="Разрыв до строки выше"
    >
      <span className="text-cyan-400">▲</span>
      {text}
    </span>
  );
}

function formatTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(3);
  return min > 0 ? `${min}:${sec.padStart(6, "0")}` : sec;
}

function formatGap(gap: unknown): string | null {
  if (gap == null) return null;
  if (typeof gap === "string") return gap;
  if (typeof gap === "number") return gap.toFixed(3);
  return null;
}

interface OverlayProps {
  startKart: string;
}

function InProgressLapIndicator({ startKart }: OverlayProps) {
  const inProgress = useInProgressLap(startKart);
  if (!inProgress) return null;
  return (
    <>
      <span className="text-gray-600">·</span>
      <span className="text-yellow-300" title={`В круге ${inProgress.nextLapNumber}`}>
        +{formatInProgressElapsed(inProgress.elapsedMs)}
      </span>
    </>
  );
}

function InProgressLapBar({ startKart }: OverlayProps) {
  const inProgress = useInProgressLap(startKart);
  if (!inProgress || inProgress.avgRecentMs === null || inProgress.avgRecentMs <= 0) return null;
  const ratio = inProgress.elapsedMs / inProgress.avgRecentMs;
  const pct = Math.max(0, Math.min(100, ratio * 100));
  const overrun = ratio > 1;
  return (
    <div
      className="mt-1 h-0.5 w-full bg-gray-700/60 overflow-hidden"
      title={`В круге ${inProgress.nextLapNumber} · среднее за 3 круга: ${formatInProgressElapsed(inProgress.avgRecentMs)}`}
    >
      <div
        className={`h-full ${overrun ? "bg-red-500" : "bg-cyan-400"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function LinkedHeatOverlay({ startKart }: OverlayProps) {
  const heat = useLinkedHeatStore((s) => s.heat);
  const latest = useLinkedHeatStore((s) => s.latestByKart.get(startKart));
  const best = useLinkedHeatStore((s) => s.bestByKart.get(startKart));
  const absoluteBest = useLinkedHeatStore((s) => selectAbsoluteBest(s.bestByKart));
  const events = useRaceStore((s) => s.events);
  const teams = useRaceStore((s) => s.teams);

  const { stintNumber, hasPit, lastPitLapNumber } = useMemo(() => {
    const team = teams?.[startKart];
    const stintNumber = team?.karts.length ?? 1;
    let hasPit = false;
    let lastPitLapNumber: number | undefined;
    if (events) {
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e.type === "pit" && e.kart === startKart) {
          hasPit = true;
          lastPitLapNumber = e.lapNumber;
          break;
        }
      }
    }
    return { stintNumber, hasPit, lastPitLapNumber };
  }, [events, teams, startKart]);

  if (!heat) return null;

  if (!latest) {
    return <div className="text-[10px] font-mono text-gray-600 mt-0.5">🔗 — · waiting</div>;
  }

  const isPersonalBest = best !== undefined && latest.time === best;
  const lastClass = isPersonalBest ? "text-green-400 font-semibold" : "text-white/70";
  const isAbsoluteBest = best !== undefined && absoluteBest !== undefined && best === absoluteBest;
  const bestClass = isAbsoluteBest ? "text-purple-400 font-semibold" : "text-green-400";
  const gap = formatGap(latest.meta?.gap);

  const lapsInStintText = !hasPit
    ? `${latest.lapCount}L`
    : lastPitLapNumber === undefined
      ? "—"
      : `${Math.max(0, latest.lapCount - lastPitLapNumber)}L`;

  return (
    <div className="text-[10px] font-mono text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
      <span className="text-cyan-300">🔗</span>
      <span>P{latest.position}</span>
      <span className="text-gray-600">·</span>
      <span>lap {latest.lapCount}</span>
      <span className="text-gray-600">·</span>
      <span>
        stint {stintNumber}/{lapsInStintText}
      </span>
      <span className="text-gray-600">·</span>
      <span>
        last <span className={lastClass}>{formatTime(latest.time)}</span>
      </span>
      <InProgressLapIndicator startKart={startKart} />
      {best !== undefined && (
        <>
          <span className="text-gray-600">·</span>
          <span>
            best <span className={bestClass}>{formatTime(best)}</span>
          </span>
        </>
      )}
      {gap && (
        <>
          <span className="text-gray-600">·</span>
          <span>gap {gap}</span>
        </>
      )}
    </div>
  );
}

export default function TeamRow({ team, onKartClick, sortDelta }: TeamRowProps) {
  const { deleteTeam } = useRaceStore();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleDeleteConfirm = () => {
    deleteTeam(team);
    setIsDeleteModalOpen(false);
  };
  return (
    <>
      {/* Desktop layout */}
      <div className="hidden sm:flex sm:flex-col min-h-11 border-b border-gray-500 w-full relative py-2">
        <div className="flex flex-row w-full">
          {/* Text zone - bottom aligned */}
          <div className="flex items-center">
            <div className="mr-4 w-8 text-[#faef66] font-bold text-sm">{team.karts[0].padStart(2, "0")}</div>
            <div className="w-48 flex-none mr-4">
              <div className="flex items-center gap-2">
                <div className="font-bold overflow-hidden whitespace-nowrap text-sm">{team.name}</div>
                {sortDelta && <SortDeltaBadge delta={sortDelta} />}
              </div>
              <LinkedHeatOverlay startKart={team.startKart} />
            </div>
          </div>

          {/* Karts zone - center aligned */}
          <div className="flex-1 flex items-center justify-start flex-wrap gap-2">
            {team.karts.toReversed().map((kart, index) => {
              const stintIndex = team.karts.length - 1 - index;
              return (
                <div key={stintIndex}>
                  <Kart
                    kart={kart}
                    onKartClick={onKartClick}
                    teamStartKart={team.startKart}
                    stintIndex={stintIndex}
                  />
                </div>
              );
            })}
          </div>

          {/* Delete button zone - center aligned */}
          <div className="flex items-center">
            <button
              onClick={() => setIsDeleteModalOpen(true)}
              className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-all duration-200"
              title="Удалить команду"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        <InProgressLapBar startKart={team.startKart} />
      </div>

      {/* Mobile layout */}
      <div className="sm:hidden border-b border-gray-500 w-full relative p-3">
        {/* Header with team number, name and delete button */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-[#faef66] text-black font-bold text-sm rounded-lg flex items-center justify-center shrink-0">
              {team.karts[0].padStart(2, "0")}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-bold text-white text-sm truncate">{team.name}</div>
                {sortDelta && <SortDeltaBadge delta={sortDelta} />}
              </div>
              <LinkedHeatOverlay startKart={team.startKart} />
            </div>
          </div>
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-all duration-200"
            title="Удалить команду"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Karts grid for mobile */}
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {team.karts.map((kart, index) => (
            <div key={index} className="flex justify-center">
              <Kart
                kart={kart}
                onKartClick={onKartClick}
                teamStartKart={team.startKart}
                stintIndex={index}
              />
            </div>
          ))}
        </div>
        <InProgressLapBar startKart={team.startKart} />
      </div>

      <DeleteTeamModal
        isOpen={isDeleteModalOpen}
        teamToDelete={team}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}
