import { useState, useEffect } from "react";
import Modal from "./Modal";
import CloseIcon from "./icons/CloseIcon";
import { useRaceStore } from "../store/useRaceStore";
import { useLinkedHeatStore } from "../linked-heat/useLinkedHeatStore";
import { computeStintStats, getTeamsOnKart } from "../linked-heat/kartBests";

function formatLapTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(3);
  return min > 0 ? `${min}:${sec.padStart(6, "0")}` : sec;
}

// Цветовая карта с названиями
const KART_COLOR_MAP = [
  { name: "Ракета", color: "bg-blue-500", description: "Идеальное состояние" },
  { name: "Отличный", color: "bg-green-700", description: "Очень хорошее состояние" },
  { name: "Средний", color: "bg-yellow-600", description: "Среднее состояние" },
  { name: "Плохой", color: "bg-red-700", description: "Плохое состояние" },
  { name: "Дрова", color: "bg-gray-600", description: "Очень плохое состояние" },
  { name: "Неизвестно", color: "bg-white", description: "Состояние не определено" }
];

interface KartModalProps {
  isOpen: boolean;
  onClose: () => void;
  kartNumber: string;
}

export default function KartModal({ isOpen, onClose, kartNumber }: KartModalProps) {
  const { raceData, setKartColors, setKartComments, teams, events } = useRaceStore();
  const linkedHeat = useLinkedHeatStore((s) => s.heat);
  const lapsByKart = useLinkedHeatStore((s) => s.lapsByKart);

  const kartColors = raceData?.kartColors || {};
  const kartComments = raceData?.kartComments || {};
  const currentColorIndex = kartColors[kartNumber] ?? 5;
  const [comment, setComment] = useState(kartComments[kartNumber] || "");

  // Обновляем локальный комментарий при изменении карта
  useEffect(() => {
    setComment(kartComments[kartNumber] || "");
  }, [kartNumber, kartComments]);

  const handleColorChange = (colorIndex: number) => {
    const newColors = { ...kartColors };
    newColors[kartNumber] = colorIndex;
    setKartColors(newColors);
  };

  const handleCommentSave = () => {
    const newComments = { ...kartComments };
    if (comment.trim() === "") {
      // Удаляем комментарий если он пустой
      delete newComments[kartNumber];
    } else {
      newComments[kartNumber] = comment.trim();
    }
    setKartComments(newComments);
  };

  const teamsOnKart = teams && events ? getTeamsOnKart(teams, events, kartNumber) : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            Карт #{kartNumber.padStart(2, "0")}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors duration-200"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col lg:flex-row gap-6 flex-1">
          {/* Left side - Color selection */}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-4">Состояние карта</h3>
            <div className="space-y-3">
              {KART_COLOR_MAP.map((colorData, index) => (
                <div
                  key={index}
                  onClick={() => handleColorChange(index)}
                  className={`flex items-center p-3 rounded-lg cursor-pointer transition-all duration-200 border-2 ${
                    currentColorIndex === index
                      ? "border-orange-500 bg-gray-700"
                      : "border-transparent bg-gray-800 hover:bg-gray-700"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full ${colorData.color} mr-3 flex items-center justify-center ${colorData.color === 'bg-white' ? 'text-black' : 'text-white'} text-xs font-bold`}
                  >
                    {kartNumber.padStart(2, "0")}
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-medium">{colorData.name}</div>
                    <div className="text-gray-400 text-sm">{colorData.description}</div>
                  </div>
                  {currentColorIndex === index && (
                    <div className="text-orange-500">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right side - Comments and Teams */}
          <div className="flex-1 flex flex-col">
            {/* Comments section */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Комментарий</h3>
              <div className="space-y-3">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onBlur={handleCommentSave}
                  placeholder="Добавьте комментарий к карту..."
                  className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 resize-none focus:outline-none focus:border-orange-500 transition-colors duration-200"
                  rows={3}
                />
                <div className="text-xs text-gray-400">
                  Комментарий сохраняется автоматически при потере фокуса
                </div>
              </div>
            </div>

            {/* Teams section */}
            <div className="flex-1 flex flex-col min-h-0">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                Команды на этом карте
                {linkedHeat && (
                  <span className="text-[11px] font-normal text-cyan-300">🔗 {linkedHeat.name}</span>
                )}
              </h3>
              {teamsOnKart.length > 0 ? (
                <div className="flex-1 overflow-y-auto max-h-64 pr-2 space-y-2">
                  {teamsOnKart.map((team) => {
                    const stats = linkedHeat && events
                      ? computeStintStats(
                          team.startKart,
                          team.stintNumber,
                          events,
                          lapsByKart.get(team.startKart),
                          raceData?.settings,
                        )
                      : null;
                    return (
                      <div
                        key={`${team.startKart}-${team.stintNumber}`}
                        className={`flex items-center justify-between p-3 rounded-lg transition-all duration-200 ${
                          team.isCurrent
                            ? "bg-green-800/50 border border-green-600"
                            : team.isStarting
                            ? "bg-blue-800/50 border border-blue-600"
                            : "bg-gray-800 border border-gray-700"
                        }`}
                      >
                        <div className="flex items-center min-w-0 flex-1">
                          <div
                            className={`w-3 h-3 rounded-full mr-3 flex-shrink-0 ${
                              team.isCurrent
                                ? "bg-green-500"
                                : team.isStarting
                                ? "bg-blue-500"
                                : "bg-orange-500"
                            }`}
                          ></div>
                          <div className="min-w-0 flex-1">
                            <div className="text-white font-medium truncate">
                              <span className="text-yellow-300 font-medium">#{team.startKart.padStart(2, "0")}</span> {team.name}
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <div className="text-purple-400">Стинт #{team.stintNumber}</div>
                              {team.isCurrent && (
                                <div className="text-green-400">• Сейчас</div>
                              )}
                              {team.isStarting && (
                                <div className="text-blue-400">• Старт</div>
                              )}
                              {!team.isCurrent && !team.isStarting && (
                                <div className="text-orange-400">• Завершен</div>
                              )}
                            </div>
                            {stats && (
                              <div className="text-[11px] font-mono mt-1">
                                {stats.kind === "ok" ? (
                                  <span className="text-cyan-300">
                                    🔗 Laps:{" "}
                                    <span className="text-white font-semibold">{stats.count}</span>{" "}
                                    <span className="text-gray-500">·</span> Avg:{" "}
                                    <span className="text-white font-semibold">
                                      {stats.avg !== null ? formatLapTime(stats.avg) : "—"}
                                    </span>{" "}
                                    <span className="text-gray-500">·</span> Best:{" "}
                                    <span className="text-green-400 font-semibold">{formatLapTime(stats.best)}</span>
                                  </span>
                                ) : stats.kind === "missing-lap-numbers" ? (
                                  <span className="text-gray-500">
                                    🔗 Укажите круги питстопов для этой команды
                                  </span>
                                ) : (
                                  <span className="text-gray-600">🔗 Нет данных в привязанной гонке</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        {team.timeAgo && (
                          <div className="text-gray-400 text-xs ml-2 flex-shrink-0">
                            {team.timeAgo}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center py-8">
                    <div className="text-gray-400 mb-2">
                      <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </div>
                    <div className="text-gray-400">На этом карте пока никто не ездил</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-700">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors duration-200"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}