"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRaceStore } from "../store/useRaceStore";
import { useRoomStore } from "../rooms/useRoomStore";
import { usePitlaneDisplayStore } from "../store/usePitlaneDisplayStore";
import { useLinkedHeatStore } from "../linked-heat/useLinkedHeatStore";
import { useKartBests, computeStintStats, getTeamsOnKart } from "../linked-heat/kartBests";
import { useInProgressLap, formatInProgressElapsed } from "../linked-heat/useInProgressLap";
import { getTrack, TRACK_LIST } from "../track/trackDefs";
import { TrackMap } from "../track/TrackMap";
import { ParsedRaceTeam } from "../types";
import { Utils } from "../../../utils/Utils";
import RaceTimer from "../components/RaceTimer";

const KART_COLORS = [
  { name: "Ракета", bg: "bg-blue-500" },
  { name: "Отличный", bg: "bg-green-700" },
  { name: "Средний", bg: "bg-yellow-600" },
  { name: "Плохой", bg: "bg-red-700" },
  { name: "Дрова", bg: "bg-gray-600" },
  { name: "Неизвестно", bg: "bg-white" },
];

function getKartColorBg(kartNumber: string, kartColors: Record<string, number>): string {
  return KART_COLORS[(kartColors[kartNumber] ?? 5) % KART_COLORS.length].bg;
}

function isWhiteKart(kartNumber: string, kartColors: Record<string, number>): boolean {
  return (kartColors[kartNumber] ?? 5) === 5;
}

// Modal for kart actions (double click): color, remove from pitlane, replace
interface KartActionModalState {
  kart: string;
  // If in pitlane, these are set:
  inPitlane?: { laneIndex: number };
  // If it's a team kart:
  teamStartKart?: string;
}

export default function MobileMode() {
  const { raceData, pitlane, teams, events, loadInitialData, addEvent, deleteEvent, undoLastAction, undoHistory, setKartColors, setKartColor, getRaceTimer } = useRaceStore();
  const { bootstrap, currentRoomId, currentRoom, sessionId, nickname, saveStatus, takeControl } = useRoomStore();
  const exitDirection = usePitlaneDisplayStore((s) => s.exitDirection);
  const order = usePitlaneDisplayStore((s) => s.order);
  const hydratePitlaneDisplay = usePitlaneDisplayStore((s) => s.hydrate);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [showTrackMap, setShowTrackMap] = useState(false);
  const [trackId, setTrackId] = useState<string>(TRACK_LIST[0]?.id ?? "");
  const track = getTrack(trackId);
  const [kartActionModal, setKartActionModal] = useState<KartActionModalState | null>(null);
  const [addKartModal, setAddKartModal] = useState<{ laneIndex: number } | null>(null);
  const [newKartNumber, setNewKartNumber] = useState("");
  const [replaceKartNumber, setReplaceKartNumber] = useState("");
  const [nextNewKart, setNextNewKart] = useState(101);

  const lastClickRef = useRef<{ kart: string; time: number } | null>(null);

  const isOwner = !!currentRoom && currentRoom.ownerSessionId === sessionId;
  const ownerLabel = currentRoom?.ownerSessionId ? currentRoom.ownerNickname ?? "Неизвестно" : "Нет владельца";

  // Join the room (if any) so race data — including the timer — stays synced with
  // the main page in real time; fall back to localStorage when not in a room.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await bootstrap();
      if (cancelled) return;
      if (!restored) loadInitialData();
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrap, loadInitialData]);

  useEffect(() => {
    hydratePitlaneDisplay();
  }, [hydratePitlaneDisplay]);

  // Watch the linked heat so pits can be auto-tagged with the current lap.
  useEffect(() => useLinkedHeatStore.getState().attachWatch(), []);

  // Restore the manually picked track.
  useEffect(() => {
    const saved = localStorage.getItem("mobileTrackId");
    if (saved && getTrack(saved)) setTrackId(saved);
  }, []);

  const selectTrack = useCallback((id: string) => {
    setTrackId(id);
    localStorage.setItem("mobileTrackId", id);
  }, []);

  const handleKartClick = useCallback(
    (kart: string, opts?: { inPitlane?: { laneIndex: number }; teamStartKart?: string }) => {
      const now = Date.now();
      const last = lastClickRef.current;

      if (last && last.kart === kart && now - last.time < 400) {
        // Double click -> open modal
        lastClickRef.current = null;
        setReplaceKartNumber(opts?.teamStartKart ? String(nextNewKart) : "");
        setKartActionModal({
          kart,
          inPitlane: opts?.inPitlane,
          teamStartKart: opts?.teamStartKart,
        });
        return;
      }

      lastClickRef.current = { kart, time: now };

      // Single click — instant
      if (opts?.teamStartKart) {
        setSelectedTeam((prev) => (prev === opts.teamStartKart ? null : opts.teamStartKart!));
      }
    },
    [],
  );

  const handlePitlaneClick = useCallback(
    (laneIndex: number) => {
      if (!selectedTeam) return;
      // Auto-link the pit to the team's current (in-progress) lap from the linked
      // heat — same lap the main page pre-selects in AddEventModal (latest + 1).
      const latest = useLinkedHeatStore.getState().latestByKart.get(selectedTeam);
      const lapNumber = latest ? latest.lapCount + 1 : undefined;
      const success = addEvent("pit", selectedTeam, laneIndex, -1, undefined, undefined, lapNumber);
      if (success) {
        setSelectedTeam(null);
      }
    },
    [selectedTeam, addEvent],
  );

  const handleColorChange = useCallback(
    (kart: string, colorIndex: number) => {
      setKartColor(kart, colorIndex);
    },
    [setKartColor],
  );

  const handleRemoveFromPitlane = useCallback(
    (kart: string, laneIndex: number) => {
      addEvent("remove_kart", kart, laneIndex, -1);
      setKartActionModal(null);
    },
    [addEvent],
  );

  const setNewKartColor = useCallback(
    (kart: string) => {
      const colors = { ...(raceData?.kartColors || {}) };
      if (colors[kart] === undefined) {
        colors[kart] = 5; // white = unknown
        setKartColors(colors);
      }
    },
    [raceData, setKartColors],
  );

  // Check if a kart number is currently used by any team
  const isKartInUse = useCallback(
    (kartNumber: string, excludeTeamStartKart?: string) => {
      if (!teams) return false;
      return Object.values(teams).some(
        (team) => team.startKart !== excludeTeamStartKart && team.karts[team.karts.length - 1] === kartNumber,
      );
    },
    [teams],
  );

  const handleReplaceKart = useCallback(() => {
    if (!kartActionModal?.teamStartKart || !replaceKartNumber.trim()) return;
    const newKart = replaceKartNumber.trim();
    if (isKartInUse(newKart, kartActionModal.teamStartKart)) {
      alert(`Карт ${newKart} уже используется другой командой`);
      return;
    }
    addEvent("breakdown", kartActionModal.teamStartKart, 0, -1, undefined, newKart);
    setNewKartColor(newKart);
    setNextNewKart((prev) => Math.max(prev, parseInt(newKart) || 0) + 1);
    setKartActionModal(null);
    setReplaceKartNumber("");
  }, [kartActionModal, replaceKartNumber, addEvent, setNewKartColor, isKartInUse]);

  const handleAddKart = useCallback(() => {
    if (!addKartModal || !newKartNumber.trim()) return;
    const kart = newKartNumber.trim();
    addEvent("add_kart", kart, addKartModal.laneIndex, -1);
    setNewKartColor(kart);
    setNextNewKart((prev) => Math.max(prev, parseInt(kart) || 0) + 1);
    setAddKartModal(null);
    setNewKartNumber("");
  }, [addKartModal, newKartNumber, addEvent, setNewKartColor]);

  const handleSwapKarts = useCallback(
    (laneIndex: number, posA: number, posB: number) => {
      const lane = pitlane?.[laneIndex];
      if (!lane || posA === posB) return;
      const kartA = lane[posA];
      const kartB = lane[posB];
      addEvent("remove_kart", kartA, laneIndex, -1);
      addEvent("remove_kart", kartB, laneIndex, -1);
      const minPos = Math.min(posA, posB);
      const maxPos = Math.max(posA, posB);
      const kartForMin = posA < posB ? kartB : kartA;
      const kartForMax = posA < posB ? kartA : kartB;
      addEvent("add_kart", kartForMin, laneIndex, -1, minPos);
      addEvent("add_kart", kartForMax, laneIndex, -1, maxPos);
      setKartActionModal(null);
    },
    [pitlane, addEvent],
  );

  if (!raceData || !pitlane || !teams || !events) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <div className="text-white text-lg">Загрузка...</div>
        </div>
      </div>
    );
  }

  const teamsArray = Object.values(teams).sort((a, b) => parseInt(a.startKart) - parseInt(b.startKart));
  const kartColors = raceData.kartColors || {};
  const pitlanesCount = raceData.pitlanesCount;
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  // Pit display prefs (shared with the main page): exit side flips kart order +
  // arrow, lane order can be reversed bottom-up.
  const isExitRight = exitDirection === "right";
  const laneIndices = Array.from({ length: pitlanesCount }, (_, i) => i);
  if (order === "bottom-up") laneIndices.reverse();

  return (
    <div className="min-h-[100dvh] bg-black text-white flex flex-col select-none" onClick={() => setSelectedTeam(null)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-10 bg-black/50 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <a href="/mega-secret-pits" className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs font-bold">
            ВЫХОД
          </a>
          {TRACK_LIST.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowTrackMap((v) => !v); }}
              className={`px-2 py-1 rounded text-xs font-bold ${
                showTrackMap ? "bg-cyan-600 hover:bg-cyan-500" : "bg-gray-700 hover:bg-gray-600"
              }`}
              title="Карта трассы"
            >
              🏁
            </button>
          )}
        </div>
        <RaceTimer compact />
        <button
          onClick={() => undoLastAction()}
          disabled={undoHistory.length === 0}
          className={`px-2 h-7 min-w-[80px] rounded text-xs font-bold ${
            undoHistory.length > 0 ? "bg-yellow-600 hover:bg-yellow-700 text-white" : "bg-gray-800 text-gray-600 cursor-not-allowed"
          }`}
        >
          {undoHistory.length > 0 && lastEvent ? `ОТМЕНА ${lastEvent.kart}` : "ОТМЕНА"}
        </button>
      </div>

      {/* Room control strip — who's editing + take control */}
      {currentRoomId && currentRoom && (
        <div
          className="flex-shrink-0 flex items-center gap-2 px-3 h-8 bg-orange-950/40 border-b border-orange-500/20 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {isOwner ? (
            <span className="text-green-300 font-bold truncate">✏ Вы управляете{nickname ? ` · ${nickname}` : ""}</span>
          ) : (
            <span className="text-gray-300 truncate">
              👁 Управляет: <span className="text-orange-200 font-bold">{ownerLabel}</span>
            </span>
          )}
          {saveStatus === "retrying" && <span className="text-yellow-400 flex-shrink-0">· Сохр…</span>}
          {saveStatus === "offline" && <span className="text-red-400 flex-shrink-0">· Оффлайн</span>}
          <div className="flex-1" />
          {!isOwner && (
            <button
              onClick={() => takeControl()}
              className="px-2 py-0.5 rounded bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-bold flex-shrink-0"
            >
              Взять управление
            </button>
          )}
        </div>
      )}

      {/* Track map — collapsible, manual track pick, karts by estimated lap progress */}
      {showTrackMap && (
        <div
          className="flex-shrink-0 h-[36vh] flex flex-col border-b border-white/10 bg-[#0b0e14]"
          onClick={(e) => e.stopPropagation()}
        >
          {TRACK_LIST.length > 0 && (
            <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1 overflow-x-auto border-b border-white/5">
              <span className="text-[10px] text-gray-500 flex-shrink-0 mr-1">Трасса:</span>
              {TRACK_LIST.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTrack(t.id)}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap flex-shrink-0 ${
                    t.id === trackId ? "bg-cyan-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 min-h-0">
            {track ? (
              <TrackMap track={track} teams={teamsArray} />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-600 text-xs">Трасса не выбрана</div>
            )}
          </div>
        </div>
      )}

      {/* Instruction bar — always rendered to avoid layout shift */}
      <div className="flex-shrink-0 px-3 pt-2">
        <div
          className={`rounded-lg px-3 flex items-center justify-between transition-colors duration-150 ${
            selectedTeam ? "bg-blue-900/40 border border-blue-500/50" : "bg-gray-800/30 border border-transparent"
          }`}
          style={{ height: 42 }}
        >
          {selectedTeam ? (
            <>
              <span className="text-blue-200 text-sm font-bold">
                Карт {teams[selectedTeam]?.karts[teams[selectedTeam]?.karts.length - 1]} выбран. Нажми на питлейн.
              </span>
              <button onClick={() => setSelectedTeam(null)} className="text-blue-300 text-xs font-bold ml-2 px-2 py-1 bg-blue-800/50 rounded">
                Отмена
              </button>
            </>
          ) : (
            <span className="text-gray-600 text-sm">Клик — выбрать карт, двойной клик — действия</span>
          )}
        </div>
      </div>

      {/* Pitlanes */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Питлейны</h2>
        </div>
        <div className="space-y-3">
          {laneIndices.map((laneIndex) => {
            const lane = pitlane[laneIndex] || [];
            // First on exit is rendered on the exit side; flip kart order when exit is right.
            const displayKarts = isExitRight ? [...lane].reverse() : lane;

            const labelNode = (
              <div className={`flex items-center gap-1 min-w-[28px] flex-shrink-0 ${isExitRight ? "ml-2" : ""}`}>
                {isExitRight ? (
                  <>
                    <span className="text-gray-500 text-xs">&#8594;</span>
                    <span className="text-yellow-400 font-bold text-sm">{Utils.getLaneLetter(laneIndex)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-yellow-400 font-bold text-sm">{Utils.getLaneLetter(laneIndex)}</span>
                    <span className="text-gray-500 text-xs">&#8592;</span>
                  </>
                )}
              </div>
            );

            const kartsNode = (
              <div className="flex items-center gap-1 flex-1 overflow-x-auto py-0.5">
                {lane.length === 0 ? (
                  <span className="text-gray-600 text-xs italic">пусто</span>
                ) : (
                  displayKarts.map((kartNumber, kartIdx) => {
                    const colorBg = getKartColorBg(kartNumber, kartColors);
                    const isWhite = isWhiteKart(kartNumber, kartColors);

                    return (
                      <div
                        key={`${kartNumber}-${kartIdx}`}
                        className="relative flex-shrink-0 flex flex-col items-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleKartClick(kartNumber, { inPitlane: { laneIndex } });
                        }}
                      >
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${colorBg} ${
                            isWhite ? "text-black" : "text-white"
                          } shadow-md active:scale-90 transition-transform`}
                        >
                          {kartNumber.padStart(2, "0")}
                        </div>
                        <KartDelta kart={kartNumber} />
                      </div>
                    );
                  })
                )}
                {/* Exit-right: keep the arrow+letter glued to the karts, empty space goes to the far right. */}
                {isExitRight && labelNode}
              </div>
            );

            const addNode = (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setNewKartNumber(String(nextNewKart));
                  setAddKartModal({ laneIndex });
                }}
                className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-400 text-lg flex-shrink-0 active:scale-90 transition-transform"
              >
                +
              </button>
            );

            return (
              <div
                key={laneIndex}
                onClick={(e) => { e.stopPropagation(); handlePitlaneClick(laneIndex); }}
                className={`rounded-lg border-2 transition-all duration-150 px-2 py-1.5 min-h-[52px] ${
                  selectedTeam ? "bg-orange-900/20 border-orange-500/50 cursor-pointer active:bg-orange-600/30" : "bg-gray-800/50 border-gray-700/50"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {isExitRight ? (
                    <>
                      {addNode}
                      {kartsNode}
                    </>
                  ) : (
                    <>
                      {labelNode}
                      {kartsNode}
                      {addNode}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Team karts grid */}
      <div className="flex-1 px-3 pt-3 pb-3">
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Карты в гонке</h2>
          <span className="text-xs text-gray-600">{teamsArray.length} команд</span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1.5">
          {teamsArray.map((team: ParsedRaceTeam) => {
            const currentKart = team.karts[team.karts.length - 1];
            const colorBg = getKartColorBg(currentKart, kartColors);
            const isWhite = isWhiteKart(currentKart, kartColors);
            const pitCount = team.karts.length - 1;
            const isSelected = selectedTeam === team.startKart;

            return (
              <div
                key={team.startKart}
                className="relative"
                onClick={(e) => { e.stopPropagation(); handleKartClick(currentKart, { teamStartKart: team.startKart }); }}
              >
                <div
                  className={`${colorBg} rounded-lg overflow-hidden p-1.5 min-h-[84px] flex flex-col items-center justify-center shadow-md relative ${
                    isSelected ? "ring-2 ring-white" : ""
                  }`}
                >
                  <div className={`text-lg font-bold leading-none ${isWhite ? "text-black" : "text-white"}`}>{team.startKart}</div>
                  <div className={`text-[9px] leading-tight mt-0.5 truncate w-full text-center ${isWhite ? "text-black/70" : "text-white/70"}`}>
                    {team.name}
                  </div>
                  <KartCardStats startKart={team.startKart} currentKart={currentKart} pitCount={pitCount} isWhite={isWhite} />
                  <InProgressLapTime startKart={team.startKart} isWhite={isWhite} />

                  {currentKart !== team.startKart && (
                    <div
                      className={`absolute top-0.5 right-0.5 text-[8px] font-bold px-1 rounded ${
                        isWhite ? "bg-black/20 text-black" : "bg-black/50 text-white"
                      }`}
                    >
                      {currentKart}
                    </div>
                  )}
                  <InProgressLapBar startKart={team.startKart} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Events history */}
      {events.length > 0 && (
        <div className="flex-shrink-0 px-3 pt-4 pb-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">История</h2>
            <span className="text-xs text-gray-600">{events.length}</span>
          </div>
          <div className="bg-gray-900/50 rounded-lg overflow-hidden">
            {events.slice().reverse().map((event, revIdx) => {
              const realIdx = events.length - 1 - revIdx;
              const laneLabel = Utils.getLaneLetter(event.lane);
              const colorBg = getKartColorBg(event.kart, kartColors);
              const isWhite = isWhiteKart(event.kart, kartColors);
              const raceTime = Utils.formatRaceTime(event.timestamp, getRaceTimer().startTime);

              let label = "";
              if (event.type === "pit") label = `Пит ${laneLabel}` + (event.pitCount ? ` #${event.pitCount}` : "");
              else if (event.type === "add_kart") label = `+ ${laneLabel}`;
              else if (event.type === "remove_kart") label = `- ${laneLabel}`;
              else if (event.type === "breakdown") label = `Замена → ${event.newKart || "?"}`;

              return (
                <div key={realIdx} className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-800/50 last:border-0">
                  <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold ${colorBg} ${isWhite ? "text-black" : "text-white"}`}>
                    {event.kart.padStart(2, "0")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-300">{label}</span>
                      {typeof event.lapNumber === "number" && (
                        <span className="text-[10px] font-mono text-cyan-300 flex-shrink-0">🔗 Круг {event.lapNumber}</span>
                      )}
                    </div>
                    {event.team?.name && (
                      <div className="text-[10px] text-gray-500 truncate">{event.team.name}</div>
                    )}
                  </div>
                  {raceTime && <span className="text-[10px] font-mono text-green-500 flex-shrink-0">{raceTime}</span>}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteEvent(realIdx); }}
                    className="text-gray-600 hover:text-red-400 text-xs flex-shrink-0 px-1"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Kart Action Modal (double click) */}
      {kartActionModal && (
        <KartActionModal
          state={kartActionModal}
          kartColors={kartColors}
          pitlane={pitlane}
          teams={teams}
          onColorChange={handleColorChange}
          onRemoveFromPitlane={handleRemoveFromPitlane}
          onSwapKarts={handleSwapKarts}
          replaceKartNumber={replaceKartNumber}
          setReplaceKartNumber={setReplaceKartNumber}
          onReplaceKart={handleReplaceKart}
          onClose={() => {
            setKartActionModal(null);
            setReplaceKartNumber("");
          }}
        />
      )}

      {/* Add Kart Modal */}
      {addKartModal && (
        <ModalOverlay onClose={() => setAddKartModal(null)}>
          <div className="bg-gray-800 rounded-xl p-5 w-72 shadow-2xl border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-3">Добавить карт в {Utils.getLaneLetter(addKartModal.laneIndex)}</h3>
            <input
              type="text"
              inputMode="numeric"
              value={newKartNumber}
              onChange={(e) => setNewKartNumber(e.target.value)}
              placeholder="Номер карта"
              className="w-full p-3 bg-gray-700 rounded-lg text-white text-center text-xl font-bold placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setAddKartModal(null);
                  setNewKartNumber("");
                }}
                className="flex-1 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-sm font-bold"
              >
                Отмена
              </button>
              <button
                onClick={handleAddKart}
                disabled={!newKartNumber.trim()}
                className="flex-1 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold"
              >
                Добавить
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ---- Kart Action Modal ----

function KartActionModal({
  state,
  kartColors,
  pitlane,
  teams,
  onColorChange,
  onRemoveFromPitlane,
  onSwapKarts,
  replaceKartNumber,
  setReplaceKartNumber,
  onReplaceKart,
  onClose,
}: {
  state: KartActionModalState;
  kartColors: Record<string, number>;
  pitlane: string[][];
  teams: Record<string, ParsedRaceTeam>;
  onColorChange: (kart: string, colorIndex: number) => void;
  onRemoveFromPitlane: (kart: string, laneIndex: number) => void;
  onSwapKarts: (laneIndex: number, posA: number, posB: number) => void;
  replaceKartNumber: string;
  setReplaceKartNumber: (v: string) => void;
  onReplaceKart: () => void;
  onClose: () => void;
}) {
  const currentColorIndex = kartColors[state.kart] ?? 5;
  const colorBg = getKartColorBg(state.kart, kartColors);
  const isWhite = isWhiteKart(state.kart, kartColors);

  // Karts in the same pitlane (for swap)
  const sameLaneKarts = state.inPitlane ? pitlane[state.inPitlane.laneIndex] || [] : [];
  const kartPosInLane = state.inPitlane ? sameLaneKarts.indexOf(state.kart) : -1;

  // Find team info if this is a team kart
  const teamInfo = state.teamStartKart ? teams[state.teamStartKart] : null;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-gray-800 rounded-xl p-5 w-full max-w-sm max-h-[85dvh] overflow-y-auto shadow-2xl border border-gray-700">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${colorBg} ${
              isWhite ? "text-black" : "text-white"
            } shadow-lg`}
          >
            {state.kart.padStart(2, "0")}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Карт #{state.kart}</h3>
            {teamInfo && <p className="text-gray-400 text-xs">{teamInfo.name}</p>}
            {state.inPitlane && (
              <p className="text-yellow-400 text-xs">
                Питлейн {Utils.getLaneLetter(state.inPitlane.laneIndex)}
              </p>
            )}
          </div>
        </div>

        {/* Stint history on this kart */}
        <KartStintHistory kart={state.kart} />

        {/* Color selection */}
        <div className="mb-4">
          <h4 className="text-sm font-bold text-gray-300 mb-2">Цвет</h4>
          <div className="flex gap-2">
            {KART_COLORS.map((color, idx) => (
              <button
                key={idx}
                onClick={() => onColorChange(state.kart, idx)}
                className={`w-9 h-9 rounded-full ${color.bg} flex items-center justify-center transition-transform ${
                  idx === currentColorIndex ? "ring-2 ring-orange-400 scale-110" : "hover:scale-105 active:scale-90"
                } ${idx === 5 ? "text-black" : "text-white"}`}
              >
                <span className="text-[8px] font-bold">{state.kart.padStart(2, "0")}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Remove from pitlane */}
        {state.inPitlane && (
          <div className="mb-4">
            <button
              onClick={() => onRemoveFromPitlane(state.kart, state.inPitlane!.laneIndex)}
              className="w-full py-2.5 bg-red-700 hover:bg-red-600 active:bg-red-800 rounded-lg text-sm font-bold transition-colors"
            >
              Убрать из питлейна {Utils.getLaneLetter(state.inPitlane.laneIndex)}
            </button>
          </div>
        )}

        {/* Swap with another kart in same pitlane */}
        {state.inPitlane && sameLaneKarts.length > 1 && (
          <div className="mb-4">
            <h4 className="text-sm font-bold text-gray-300 mb-2">Поменять местами с</h4>
            <div className="flex flex-wrap gap-1.5">
              {sameLaneKarts.map((k, idx) => {
                if (k === state.kart) return null;
                const kBg = getKartColorBg(k, kartColors);
                const kWhite = isWhiteKart(k, kartColors);
                return (
                  <button
                    key={`${k}-${idx}`}
                    onClick={() => onSwapKarts(state.inPitlane!.laneIndex, kartPosInLane, idx)}
                    className={`w-10 h-10 rounded-full ${kBg} flex items-center justify-center text-xs font-bold ${
                      kWhite ? "text-black" : "text-white"
                    } hover:scale-110 active:scale-90 transition-transform shadow-md`}
                  >
                    {k.padStart(2, "0")}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Replace kart (breakdown) - only for team karts */}
        {state.teamStartKart && (
          <div className="mb-4">
            <h4 className="text-sm font-bold text-gray-300 mb-2">Замена карта (рем. зона)</h4>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={replaceKartNumber}
                onChange={(e) => setReplaceKartNumber(e.target.value)}
                placeholder="Новый номер"
                className="flex-1 p-2 bg-gray-700 rounded-lg text-white text-center font-bold placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={onReplaceKart}
                disabled={!replaceKartNumber.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold"
              >
                Заменить
              </button>
            </div>
          </div>
        )}

        {/* Close */}
        <button onClick={onClose} className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-bold mt-1">
          Закрыть
        </button>
      </div>
    </ModalOverlay>
  );
}

function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function deltaColorClass(deltaMs: number): string {
  if (deltaMs < 300) return "text-emerald-400";
  if (deltaMs < 800) return "text-lime-400";
  if (deltaMs < 1500) return "text-amber-400";
  if (deltaMs < 3000) return "text-orange-400";
  return "text-red-500";
}

function formatLapTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(3);
  return min > 0 ? `${min}:${sec.padStart(6, "0")}` : sec;
}

// Compact stint history for one physical kart: every team stint that drove it,
// newest first, with laps/avg/best from the linked heat.
function KartStintHistory({ kart }: { kart: string }) {
  const heat = useLinkedHeatStore((s) => s.heat);
  const lapsByKart = useLinkedHeatStore((s) => s.lapsByKart);
  const teams = useRaceStore((s) => s.teams);
  const events = useRaceStore((s) => s.events);
  const settings = useRaceStore((s) => s.raceData?.settings);

  const entries = useMemo(
    () => (teams && events ? getTeamsOnKart(teams, events, kart) : []),
    [teams, events, kart],
  );

  if (!heat || entries.length === 0) return null;

  return (
    <div className="mb-4">
      <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
        История стинтов
        <span className="text-[10px] font-normal text-cyan-300 truncate">🔗 {heat.name}</span>
      </h4>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {entries.map((e) => {
          const stats = events
            ? computeStintStats(e.startKart, e.stintNumber, events, lapsByKart.get(e.startKart), settings)
            : null;
          return (
            <div
              key={`${e.startKart}-${e.stintNumber}`}
              className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-gray-900/60 text-[11px]"
            >
              <div className="min-w-0 flex items-center gap-1.5">
                <span className="text-yellow-300 font-bold flex-shrink-0">#{e.startKart.padStart(2, "0")}</span>
                <span className="text-gray-300 truncate min-w-0">{e.name}</span>
                <span className="text-purple-400 flex-shrink-0">S{e.stintNumber}</span>
                {e.isCurrent && <span className="text-green-400 flex-shrink-0">•сейчас</span>}
              </div>
              <div className="font-mono text-[10px] flex-shrink-0">
                {stats?.kind === "ok" ? (
                  <span className="text-gray-400">
                    {stats.count}кр · <span className="text-white">{stats.avg !== null ? formatLapTime(stats.avg) : "—"}</span>{" "}
                    · <span className="text-green-400">{formatLapTime(stats.best)}</span>
                  </span>
                ) : stats?.kind === "missing-lap-numbers" ? (
                  <span className="text-gray-600">нет кругов</span>
                ) : (
                  <span className="text-gray-600">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Live countdown to the end of the current (in-progress) lap — ticks every 100ms
// via the shared useInProgressLap tick. The expected lap length is the same metric
// the progress bar uses: the average of the 3 most recent laps, excluding pits and
// laps over the settings' max-lap-time threshold. Goes red and counts up once the
// lap overruns that estimate.
function InProgressLapTime({ startKart, isWhite }: { startKart: string; isWhite: boolean }) {
  const inProgress = useInProgressLap(startKart);
  if (!inProgress || inProgress.avgRecentMs === null || inProgress.avgRecentMs <= 0) return null;
  const remainingMs = inProgress.avgRecentMs - inProgress.elapsedMs;
  const overrun = remainingMs < 0;
  return (
    <div
      className={`text-[9px] font-mono font-bold leading-tight ${
        overrun ? "text-red-400" : isWhite ? "text-black/80" : "text-cyan-200"
      }`}
      title={`До конца круга ${inProgress.nextLapNumber} (оценка по среднему за 3 круга)`}
    >
      {overrun ? "+" : "−"}
      {formatInProgressElapsed(Math.abs(remainingMs))}
    </div>
  );
}

// In-progress lap progress strip along the bottom edge of each team card — same
// visualization as the main page (TeamRow's InProgressLapBar). Width = how far
// the current lap has progressed vs the team's 3-lap average; turns red on overrun.
function InProgressLapBar({ startKart }: { startKart: string }) {
  const inProgress = useInProgressLap(startKart);
  if (!inProgress || inProgress.avgRecentMs === null || inProgress.avgRecentMs <= 0) return null;
  const ratio = inProgress.elapsedMs / inProgress.avgRecentMs;
  const pct = Math.max(0, Math.min(100, ratio * 100));
  const overrun = ratio > 1;
  return (
    <div
      className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/40 overflow-hidden rounded-b-lg"
      title={`В круге ${inProgress.nextLapNumber} · среднее за 3 круга: ${formatInProgressElapsed(inProgress.avgRecentMs)}`}
    >
      <div
        className={`h-full rounded-r-full transition-[width] duration-100 ease-linear ${
          overrun
            ? "bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_6px_rgba(248,113,113,0.7)]"
            : "bg-gradient-to-r from-cyan-500 to-cyan-300 shadow-[0_0_6px_rgba(34,211,238,0.6)]"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// +X.XX gap of this physical kart's best lap to the global best — same metric the
// main page shows under each kart. Rendered under pit-lane kart circles.
function KartDelta({ kart }: { kart: string }) {
  const heat = useLinkedHeatStore((s) => s.heat);
  const { kartBest, globalBest } = useKartBests(kart);
  if (!heat || kartBest === null || globalBest === null) return null;
  const delta = Math.max(0, kartBest - globalBest);
  const cls = delta === 0 ? "text-violet-400" : deltaColorClass(delta);
  return (
    <span className={`mt-0.5 text-[8px] leading-none font-mono font-bold ${cls}`}>
      +{(delta / 1000).toFixed(2)}
    </span>
  );
}

// Per-card linked-heat stats: stint count, laps in current stint / total, and the
// +X.XX gap of this physical kart's best lap to the global best — same metric the
// main page shows under each kart (KartDeltaByPhysical).
function KartCardStats({
  startKart,
  currentKart,
  pitCount,
  isWhite,
}: {
  startKart: string;
  currentKart: string;
  pitCount: number;
  isWhite: boolean;
}) {
  const heat = useLinkedHeatStore((s) => s.heat);
  const latest = useLinkedHeatStore((s) => s.latestByKart.get(startKart));
  const events = useRaceStore((s) => s.events);
  const { kartBest, globalBest } = useKartBests(currentKart);

  const muted = isWhite ? "text-black/50" : "text-white/50";
  const sub = isWhite ? "text-black/70" : "text-white/70";

  // No linked heat or no laps yet — fall back to the plain pit count.
  if (!heat || !latest) {
    return <div className={`text-[9px] leading-tight ${muted}`}>пит: {pitCount}</div>;
  }

  const stintNumber = pitCount + 1;

  // Laps in the current stint = laps since the last pit's linked lap number.
  let lastPitLapNumber: number | undefined;
  let hasPit = false;
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
  const lapsInStint = !hasPit
    ? latest.lapCount
    : lastPitLapNumber === undefined
      ? null
      : Math.max(0, latest.lapCount - lastPitLapNumber);

  const delta = kartBest !== null && globalBest !== null ? Math.max(0, kartBest - globalBest) : null;
  const deltaClass = delta === 0 ? "text-violet-400" : delta !== null ? deltaColorClass(delta) : "";

  return (
    <div className="leading-tight text-center">
      <div
        className={`text-[9px] ${sub}`}
        title={`Стинтов: ${stintNumber} · кругов в стинте: ${lapsInStint ?? "—"} · всего: ${latest.lapCount}`}
      >
        S{stintNumber} · {lapsInStint ?? "—"}/{latest.lapCount}
      </div>
      {delta !== null && (
        <div
          className={`text-[9px] font-mono font-bold leading-tight ${deltaClass}`}
          title="Отставание лучшего круга этого карта от абсолютного беста"
        >
          +{(delta / 1000).toFixed(2)}
        </div>
      )}
    </div>
  );
}
