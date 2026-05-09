"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRaceStore } from "../store/useRaceStore";
import { useLiveTimingStore } from "../store/useLiveTimingStore";
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

function formatLapTime(ms: number): string {
  if (!ms || ms <= 0) return "-";
  const seconds = ms / 1000;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
  return secs.toFixed(1);
}

export default function MobileMode() {
  const { raceData, pitlane, teams, events, loadInitialData, addEvent, deleteEvent, undoLastAction, undoHistory, setKartColors, getRaceTimer } = useRaceStore();
  const { connected, connect, disconnect, sessions, selectedSessionName, selectSession, loadSessions, getKartLiveData, currentSessionName } =
    useLiveTimingStore();

  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [kartActionModal, setKartActionModal] = useState<KartActionModalState | null>(null);
  const [addKartModal, setAddKartModal] = useState<{ laneIndex: number } | null>(null);
  const [newKartNumber, setNewKartNumber] = useState("");
  const [replaceKartNumber, setReplaceKartNumber] = useState("");
  const [nextNewKart, setNextNewKart] = useState(101);
  const [showLivePanel, setShowLivePanel] = useState(false);

  const lastClickRef = useRef<{ kart: string; time: number } | null>(null);

  useEffect(() => {
    loadInitialData();
    loadSessions();
  }, [loadInitialData, loadSessions]);

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
      const team = teams?.[selectedTeam];
      const currentKart = team?.karts[team.karts.length - 1];
      const lapNumber = selectedSessionName && currentKart ? getKartLiveData(currentKart)?.lapCount : undefined;
      const success = addEvent("pit", selectedTeam, laneIndex, -1, undefined, undefined, lapNumber ?? undefined);
      if (success) {
        setSelectedTeam(null);
      }
    },
    [selectedTeam, addEvent, teams, selectedSessionName, getKartLiveData],
  );

  const handleColorChange = useCallback(
    (kart: string, colorIndex: number) => {
      const colors = { ...(raceData?.kartColors || {}) };
      colors[kart] = colorIndex;
      setKartColors(colors);
    },
    [raceData, setKartColors],
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

  return (
    <div className="min-h-[100dvh] max-h-[100dvh] bg-black text-white flex flex-col overflow-hidden select-none" onClick={() => setSelectedTeam(null)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-10 bg-black/50 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <a href="/pits" className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs font-bold">
            ВЫХОД
          </a>
          <button
            onClick={(e) => { e.stopPropagation(); setShowLivePanel(!showLivePanel); }}
            className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 ${
              connected ? "bg-green-700 hover:bg-green-600" : "bg-rose-700 hover:bg-rose-600"
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-300 animate-pulse" : "bg-rose-300"}`} />
            LIVE
          </button>
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

      {/* Live timing panel */}
      {showLivePanel && (
        <div className="flex-shrink-0 px-3 pt-2" onClick={(e) => e.stopPropagation()}>
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400">SMS-Timing</span>
              {!connected ? (
                <button onClick={connect} className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs font-bold">
                  Подключиться
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {currentSessionName && <span className="text-[10px] text-green-400 truncate max-w-[150px]">{currentSessionName}</span>}
                  <button onClick={disconnect} className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-bold">
                    Откл.
                  </button>
                </div>
              )}
            </div>
            {/* Session selector */}
            {Object.keys(sessions).length > 0 && (
              <div>
                <div className="text-[10px] text-gray-500 mb-1">Заезд для сопоставления:</div>
                <div className="flex flex-wrap gap-1">
                  {Object.values(sessions)
                    .sort((a, b) => b.lastUpdate - a.lastUpdate)
                    .map((s) => (
                      <button
                        key={s.name}
                        onClick={() => selectSession(selectedSessionName === s.name ? null : s.name)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold truncate max-w-[200px] ${
                          selectedSessionName === s.name
                            ? "bg-blue-600 text-white"
                            : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                </div>
              </div>
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
        <div className="space-y-1.5">
          {Array.from({ length: pitlanesCount }, (_, laneIndex) => {
            const lane = pitlane[laneIndex] || [];

            return (
              <div
                key={laneIndex}
                onClick={(e) => { e.stopPropagation(); handlePitlaneClick(laneIndex); }}
                className={`rounded-lg border-2 transition-all duration-150 px-2 py-1.5 min-h-[52px] ${
                  selectedTeam ? "bg-orange-900/20 border-orange-500/50 cursor-pointer active:bg-orange-600/30" : "bg-gray-800/50 border-gray-700/50"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 min-w-[28px] flex-shrink-0">
                    <span className="text-yellow-400 font-bold text-sm">{Utils.getLaneLetter(laneIndex)}</span>
                    <span className="text-gray-500 text-xs">&#8592;</span>
                  </div>

                  <div className="flex items-center gap-1 flex-1 overflow-x-auto py-0.5">
                    {lane.length === 0 ? (
                      <span className="text-gray-600 text-xs italic">пусто</span>
                    ) : (
                      lane.map((kartNumber, kartIdx) => {
                        const colorBg = getKartColorBg(kartNumber, kartColors);
                        const isWhite = isWhiteKart(kartNumber, kartColors);

                        return (
                          <div
                            key={`${kartNumber}-${kartIdx}`}
                            className="relative flex-shrink-0"
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
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Add kart button */}
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
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Team karts grid */}
      <div className="flex-1 px-3 pt-3 pb-3 overflow-y-auto min-h-0">
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
            const liveData = selectedSessionName ? getKartLiveData(currentKart) : null;

            return (
              <div
                key={team.startKart}
                className="relative"
                onClick={(e) => { e.stopPropagation(); handleKartClick(currentKart, { teamStartKart: team.startKart }); }}
              >
                <div
                  className={`${colorBg} rounded-lg p-1.5 h-[72px] flex flex-col items-center justify-center shadow-md relative ${
                    isSelected ? "ring-2 ring-white" : ""
                  }`}
                >
                  <div className={`text-lg font-bold leading-none ${isWhite ? "text-black" : "text-white"}`}>{team.startKart}</div>
                  <div className={`text-[9px] leading-tight mt-0.5 truncate w-full text-center ${isWhite ? "text-black/70" : "text-white/70"}`}>
                    {team.name}
                  </div>
                  {liveData ? (
                    <div className={`text-[9px] leading-tight ${isWhite ? "text-black/60" : "text-white/60"}`}>
                      <span className="font-mono">{formatLapTime(liveData.lastLap)}</span>
                      <span className="mx-0.5">|</span>
                      <span>L{liveData.lapCount}</span>
                    </div>
                  ) : (
                    <div className={`text-[9px] leading-tight ${isWhite ? "text-black/50" : "text-white/50"}`}>пит: {pitCount}</div>
                  )}

                  {currentKart !== team.startKart && (
                    <div
                      className={`absolute top-0.5 right-0.5 text-[8px] font-bold px-1 rounded ${
                        isWhite ? "bg-black/20 text-black" : "bg-black/50 text-white"
                      }`}
                    >
                      {currentKart}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Events history */}
      {events.length > 0 && (
        <div className="flex-shrink-0 px-3 pb-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">История</h2>
            <span className="text-xs text-gray-600">{events.length}</span>
          </div>
          <div className="bg-gray-900/50 rounded-lg overflow-hidden max-h-32 overflow-y-auto">
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
                  <span className="text-xs text-gray-300 flex-1 truncate">{label}</span>
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
