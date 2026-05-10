"use client";
import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { ParsedRaceEvent } from "../types";
import { useRaceStore } from "../store/useRaceStore";
import { useLinkedHeatStore } from "../linked-heat/useLinkedHeatStore";
import { useInProgressLap, formatInProgressElapsed } from "../linked-heat/useInProgressLap";

function formatLapTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(3);
  return min > 0 ? `${min}:${sec.padStart(6, "0")}` : sec;
}

interface InProgressLapButtonProps {
  startKart: string;
  selectedLapNumber: number | null;
  onToggle: (lapNumber: number) => void;
}

function InProgressLapButton({ startKart, selectedLapNumber, onToggle }: InProgressLapButtonProps) {
  const inProgress = useInProgressLap(startKart);
  if (!inProgress) return null;
  const isSelected = selectedLapNumber === inProgress.nextLapNumber;
  return (
    <button
      type="button"
      onClick={() => onToggle(inProgress.nextLapNumber)}
      className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-sm font-mono border-b border-gray-700/50 transition-colors ${
        isSelected ? "bg-yellow-600/40 text-white" : "text-yellow-200 hover:bg-yellow-900/20"
      }`}
      title="Пит на текущем (ещё не завершённом) круге"
    >
      <span>Lap {inProgress.nextLapNumber} (in progress)</span>
      <span className="text-yellow-400">+{formatInProgressElapsed(inProgress.elapsedMs)}</span>
      <span className="w-12 text-right">🅿️?</span>
    </button>
  );
}

interface EditPitEventModalProps {
  isOpen: boolean;
  event: ParsedRaceEvent | null;
  eventIndex: number;
  onClose: () => void;
}

export default function EditPitEventModal({ isOpen, event, eventIndex, onClose }: EditPitEventModalProps) {
  const updatePitEventLap = useRaceStore((s) => s.updatePitEventLap);
  const raceData = useRaceStore((s) => s.raceData);
  const linkedHeat = useLinkedHeatStore((s) => s.heat);
  const lapsByKart = useLinkedHeatStore((s) => s.lapsByKart);

  const startKart = event?.team?.startKart ?? "";
  const initialLap = event?.lapNumber ?? null;
  const [pitLapNumber, setPitLapNumber] = useState<number | null>(initialLap);

  useEffect(() => {
    if (isOpen) setPitLapNumber(initialLap);
  }, [isOpen, initialLap]);

  const teamLaps = useMemo(() => {
    if (!startKart || !linkedHeat) return [];
    const list = lapsByKart.get(startKart);
    if (!list) return [];
    return [...list].sort((a, b) => b.lapCount - a.lapCount);
  }, [startKart, linkedHeat, lapsByKart]);

  // Lap numbers already used by other pit events of this team (so user sees what's taken).
  const pittedLapsForTeam = useMemo(() => {
    if (!startKart || !raceData) return new Set<number>();
    const set = new Set<number>();
    for (let i = 0; i < raceData.events.length; i++) {
      if (i === eventIndex) continue; // skip the one being edited
      const ev = raceData.events[i];
      if (ev.type === "pit" && ev.kart === startKart && typeof ev.lapNumber === "number") {
        set.add(ev.lapNumber);
      }
    }
    return set;
  }, [startKart, raceData, eventIndex]);

  if (!event || !event.team || event.type !== "pit") return null;

  const handleSave = () => {
    updatePitEventLap(eventIndex, pitLapNumber);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Редактировать пит</h2>
        <div className="text-blue-300 mb-6 text-sm">
          Пит #{event.pitCount} · {event.team.name} (#{event.team.startKart.padStart(2, "0")})
        </div>

        <div className="space-y-4">
          {!linkedHeat && (
            <div className="text-sm text-gray-500 bg-gray-800/40 p-3 rounded-lg border border-gray-600/30 text-left">
              Гонка не привязана — выбрать круг нельзя.
            </div>
          )}

          {linkedHeat && (
            <div>
              <label className="block text-lg font-medium text-gray-300 mb-2 text-left">
                Круг питстопа <span className="text-gray-500 text-sm">(опционально)</span>
              </label>
              {teamLaps.length === 0 ? (
                <div className="text-sm text-gray-500 bg-gray-800/40 p-3 rounded-lg border border-gray-600/30 text-left">
                  Кругов в привязанной гонке для этой команды ещё нет.
                </div>
              ) : (
                <div className="bg-gray-800/40 border border-gray-600/30 rounded-lg max-h-64 overflow-y-auto">
                  <InProgressLapButton
                    startKart={startKart}
                    selectedLapNumber={pitLapNumber}
                    onToggle={(lapNumber) =>
                      setPitLapNumber(pitLapNumber === lapNumber ? null : lapNumber)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setPitLapNumber(null)}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-gray-700 transition-colors ${
                      pitLapNumber === null
                        ? "bg-blue-600/30 text-blue-100"
                        : "text-gray-400 hover:bg-gray-700/40"
                    }`}
                  >
                    — Без привязки к кругу
                  </button>
                  {teamLaps.map((lap) => {
                    const alreadyPitted = pittedLapsForTeam.has(lap.lapCount);
                    const isSelected = pitLapNumber === lap.lapCount;
                    return (
                      <button
                        key={lap.id}
                        type="button"
                        onClick={() =>
                          setPitLapNumber(isSelected ? null : lap.lapCount)
                        }
                        className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-sm font-mono border-b border-gray-700/50 transition-colors ${
                          isSelected
                            ? "bg-blue-600/40 text-white"
                            : alreadyPitted
                              ? "text-orange-300 hover:bg-orange-900/20"
                              : "text-gray-300 hover:bg-gray-700/40"
                        }`}
                      >
                        <span>Lap {lap.lapCount}</span>
                        <span className="text-gray-500">{formatLapTime(lap.time)}</span>
                        <span className="w-12 text-right">
                          {alreadyPitted && (
                            <span title="На этом круге уже зафиксирован питстоп этой команды">
                              🅿️ pit
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-4 justify-center pt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-8 py-3 text-gray-300 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors duration-200 min-w-[120px]"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-8 py-3 rounded-lg transition-colors duration-200 min-w-[120px] bg-blue-600 hover:bg-blue-700 text-white"
          >
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  );
}
