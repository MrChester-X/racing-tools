import { useMemo, useState } from "react";
import TeamRow, { TeamSortDelta } from "./TeamRow";
import PlusIcon from "./icons/PlusIcon";
import AddTeamModal from "./AddTeamModal";
import { useRaceStore } from "../store/useRaceStore";
import { useLinkedHeatStore } from "../linked-heat/useLinkedHeatStore";
import { ParsedRaceTeam } from "../types";
import { LapItem } from "@/app/heats/types";

interface TeamsListProps {
  onKartClick?: (kartNumber: string) => void;
}

type SortMode = "creation" | "position" | "lastCrossing";

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: "creation", label: "По созданию" },
  { id: "position", label: "По месту" },
  { id: "lastCrossing", label: "По последней отсечке" },
];

function rt(lap: LapItem | undefined): number | null {
  if (!lap) return null;
  const meta = lap.meta as { raceTimeMs?: number } | undefined;
  if (typeof meta?.raceTimeMs === "number") return meta.raceTimeMs;
  return null;
}

export default function TeamsList({ onKartClick }: TeamsListProps) {
  const teams = useRaceStore((s) => s.teams);
  const addTeam = useRaceStore((s) => s.addTeam);
  const linkedHeat = useLinkedHeatStore((s) => s.heat);
  const latestByKart = useLinkedHeatStore((s) => s.latestByKart);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("creation");

  const teamList = useMemo<ParsedRaceTeam[]>(() => {
    if (!teams) return [];
    const all = Object.values(teams);
    if (!linkedHeat || sortMode === "creation") return all;

    const sorted = [...all];
    if (sortMode === "position") {
      sorted.sort((a, b) => {
        const pa = latestByKart.get(a.startKart)?.position;
        const pb = latestByKart.get(b.startKart)?.position;
        if (pa === undefined && pb === undefined) return 0;
        if (pa === undefined) return 1;
        if (pb === undefined) return -1;
        return pa - pb;
      });
    } else if (sortMode === "lastCrossing") {
      // Кто только что пересёк S/F — наверху (минимальный прогресс круга).
      // Дальше прогресс по нарастанию: внизу — кто скоро замкнёт круг.
      // Лидер по последней отсечке оказывается первым сам собой.
      // Лапы не учитываем — «без обгонов через круг».
      const passAtMs = (t: ParsedRaceTeam): number | null => {
        const p = latestByKart.get(t.startKart)?.passAt;
        if (!p) return null;
        const ms = Date.parse(p);
        return Number.isFinite(ms) ? ms : null;
      };
      sorted.sort((a, b) => {
        const ta = passAtMs(a);
        const tb = passAtMs(b);
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;
        if (tb === null) return -1;
        return tb - ta;
      });
      return sorted;
    }
    return sorted;
  }, [teams, linkedHeat, sortMode, latestByKart]);

  // Дельта в зависимости от режима сортировки.
  // creation → разрыв до лидера; position/lastCrossing → до строки выше.
  const sortDeltas = useMemo<Map<string, TeamSortDelta>>(() => {
    const map = new Map<string, TeamSortDelta>();
    if (!linkedHeat) return map;

    const computeDelta = (
      myLap: ReturnType<typeof latestByKart.get>,
      refLap: ReturnType<typeof latestByKart.get>,
    ): TeamSortDelta | null => {
      if (!myLap || !refLap) return null;
      const lapDiff = Math.abs((refLap.lapCount ?? 0) - (myLap.lapCount ?? 0));
      if (lapDiff > 0) return { kind: "lap", value: lapDiff };
      const myRt = rt(myLap);
      const refRt = rt(refLap);
      if (myRt === null || refRt === null) return null;
      return { kind: "time", value: Math.abs(myRt - refRt) };
    };

    if (sortMode === "creation") {
      // Лидер — команда с минимальной позицией среди всех (не только в текущем списке).
      let leader: ParsedRaceTeam | null = null;
      let leaderPos = Infinity;
      for (const t of teamList) {
        const p = latestByKart.get(t.startKart)?.position;
        if (typeof p === "number" && p < leaderPos) {
          leaderPos = p;
          leader = t;
        }
      }
      if (!leader) return map;
      const leaderLap = latestByKart.get(leader.startKart);
      for (const me of teamList) {
        if (me.startKart === leader.startKart) continue;
        const myLap = latestByKart.get(me.startKart);
        const d = computeDelta(myLap, leaderLap);
        if (d) map.set(me.startKart, d);
      }
      return map;
    }

    // position / lastCrossing — до строки выше
    for (let i = 1; i < teamList.length; i++) {
      const me = teamList[i];
      const above = teamList[i - 1];
      const d = computeDelta(latestByKart.get(me.startKart), latestByKart.get(above.startKart));
      if (d) map.set(me.startKart, d);
    }
    return map;
  }, [linkedHeat, sortMode, teamList, latestByKart]);

  const handleAddTeam = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const teamName = formData.get('teamName') as string;
    const startKart = formData.get('startKart') as string;

    const success = addTeam(teamName, startKart);

    if (!success) {
      alert('Команда с таким номером карта уже существует!');
      return;
    }

    setIsAddModalOpen(false);

    // Reset form
    (e.target as HTMLFormElement).reset();
  };

  if (!teams) return null;
  return (
    <section className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-white/10 shadow-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-gradient-to-r from-green-500 to-emerald-400 rounded-lg flex items-center justify-center">
            👥
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white">Команды</h2>
          <div className="hidden sm:block flex-1 h-px bg-gradient-to-r from-white/20 to-transparent ml-4"></div>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white px-3 sm:px-4 py-2 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 text-sm sm:text-base"
        >
          <PlusIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Добавить команду</span>
          <span className="sm:hidden">Добавить</span>
        </button>
      </div>

      {linkedHeat && (
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Сортировка:</span>
          <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06] flex-wrap">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSortMode(opt.id)}
                className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  sortMode === opt.id
                    ? "bg-white/[0.08] text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col justify-center mt-3 w-full">
        {teamList.map((team) => (
          <TeamRow
            key={team.startKart}
            team={team}
            onKartClick={onKartClick}
            sortDelta={sortDeltas.get(team.startKart)}
          />
        ))}
      </div>

      <AddTeamModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddTeam}
      />
    </section>
  );
}
