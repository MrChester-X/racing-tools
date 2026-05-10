import { useState, useEffect, useMemo } from "react";
import Modal from "./Modal";
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
        isSelected
          ? "bg-yellow-600/40 text-white"
          : "text-yellow-200 hover:bg-yellow-900/20"
      }`}
      title="Пит на текущем (ещё не завершённом) круге"
    >
      <span>Lap {inProgress.nextLapNumber} (in progress)</span>
      <span className="text-yellow-400">+{formatInProgressElapsed(inProgress.elapsedMs)}</span>
      <span className="w-12 text-right">🅿️?</span>
    </button>
  );
}

interface AddEventModalProps {
  isOpen: boolean;
  insertIndex: number;
  onClose: () => void;
}

export default function AddEventModal({
  isOpen,
  insertIndex,
  onClose,
}: AddEventModalProps) {
  const { teams, raceData, addEvent, getPitlaneStateAtEvent } = useRaceStore();
  const linkedHeat = useLinkedHeatStore((s) => s.heat);
  const lapsByKart = useLinkedHeatStore((s) => s.lapsByKart);
  const [eventType, setEventType] = useState<"pit" | "add_kart" | "remove_kart" | "breakdown">("pit");
  const [teamKart, setTeamKart] = useState("");
  const [kartNumber, setKartNumber] = useState("");
  const [selectedKartPosition, setSelectedKartPosition] = useState(-1);
  const [addPosition, setAddPosition] = useState(-1); // -1 = в конец, 0+ = позиция
  const [newKartNumber, setNewKartNumber] = useState("");
  const [lane, setLane] = useState(0);
  const [pitLapNumber, setPitLapNumber] = useState<number | null>(null);

  // Список кругов команды из привязанной гонки (от свежих к старым)
  const teamLaps = useMemo(() => {
    if (!teamKart || !linkedHeat) return [];
    const list = lapsByKart.get(teamKart);
    if (!list) return [];
    return [...list].sort((a, b) => b.lapCount - a.lapCount);
  }, [teamKart, linkedHeat, lapsByKart]);

  // Множество lapNumber'ов, на которых уже зафиксированы pit'ы этой команды
  const pittedLapsForTeam = useMemo(() => {
    if (!teamKart || !raceData) return new Set<number>();
    const set = new Set<number>();
    for (const ev of raceData.events) {
      if (ev.type === "pit" && ev.kart === teamKart && typeof ev.lapNumber === "number") {
        set.add(ev.lapNumber);
      }
    }
    return set;
  }, [teamKart, raceData]);
  
  // Получаем состояние питлейна на момент добавления события
  const targetIndex = insertIndex === -1 ? (raceData?.events.length || 0) : insertIndex;
  const pitlaneState = getPitlaneStateAtEvent(targetIndex);
  const availableKarts = pitlaneState ? pitlaneState[lane] || [] : [];

  // Сбрасываем выбранные позиции при изменении питлейна или типа события.
  // pitLapNumber сюда НЕ включаем — выбор круга относится к команде, а не к
  // питлейну, и при переключении лейна сохраняется.
  useEffect(() => {
    setSelectedKartPosition(-1);
    setAddPosition(-1);
    setNewKartNumber("");
  }, [lane, eventType]);

  // Сбрасываем выбранный круг при смене команды или типа события
  useEffect(() => {
    setPitLapNumber(null);
  }, [teamKart, eventType]);

  // Находим максимальный номер карта для подсказки
  const getMaxKartNumber = () => {
    if (!teams) return 0;
    let maxNumber = 0;
    Object.values(teams).forEach(team => {
      team.karts.forEach(kart => {
        const num = parseInt(kart);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      });
    });
    return maxNumber;
  };

  const maxKartNumber = getMaxKartNumber();
  const suggestedKartNumbers = [maxKartNumber + 1, maxKartNumber + 2, maxKartNumber + 3];

  // Проверяем, можно ли добавить событие
  const canSubmit = () => {
    if (eventType === "pit") return teamKart.trim() !== "";
    if (eventType === "add_kart") return kartNumber.trim() !== "";
    if (eventType === "remove_kart") return selectedKartPosition !== -1 && availableKarts.length > 0;
    if (eventType === "breakdown") return teamKart.trim() !== "" && newKartNumber.trim() !== "";
    return false;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (eventType === "pit") {
      if (!teamKart.trim()) {
        alert("Выберите команду!");
        return;
      }
    } else if (eventType === "add_kart") {
      if (!kartNumber.trim()) {
        alert("Укажите номер карта!");
        return;
      }
    } else if (eventType === "remove_kart") {
      if (selectedKartPosition === -1) {
        alert("Выберите карт для удаления!");
        return;
      }
    } else if (eventType === "breakdown") {
      if (!teamKart.trim()) {
        alert("Выберите команду!");
        return;
      }
      if (!newKartNumber.trim()) {
        alert("Укажите номер нового карта!");
        return;
      }
    }

    let kart: string;
    let position: number | undefined;
    let newKart: string | undefined;
    
    if (eventType === "pit") {
      kart = teamKart.trim();
    } else if (eventType === "add_kart") {
      kart = kartNumber.trim();
      position = addPosition;
    } else if (eventType === "breakdown") {
      kart = teamKart.trim(); // команда, у которой сломался карт
      newKart = newKartNumber.trim(); // новый карт на замену
    } else {
      // remove_kart
      kart = availableKarts[selectedKartPosition];
    }

    // Для breakdown события питлейн не используется, устанавливаем 0
    const eventLane = eventType === "breakdown" ? 0 : lane;
    const lapNumberArg =
      eventType === "pit" && pitLapNumber !== null ? pitLapNumber : undefined;
    const success = addEvent(eventType, kart, eventLane, insertIndex, position, newKart, lapNumberArg);

    if (!success) {
      alert("Ошибка добавления события. Проверьте корректность данных.");
      return;
    }

    setEventType("pit");
    setTeamKart("");
    setKartNumber("");
    setSelectedKartPosition(-1);
    setAddPosition(-1);
    setNewKartNumber("");
    setLane(0);
    setPitLapNumber(null);
    onClose();
  };

  if (!teams || !raceData) return null;

  const getPositionText = () => {
    if (insertIndex === 0) return "в начало";
    if (insertIndex === -1) return "в конец";
    return `на позицию ${insertIndex + 1}`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Добавить событие</h2>
        <div className="text-blue-300 mb-8 text-lg">
          {getPositionText()}
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6">
            <div>
              <label htmlFor="eventType" className="block text-lg font-medium text-gray-300 mb-3 text-left">
                Тип события
              </label>
              <select
                id="eventType"
                value={eventType}
                onChange={(e) => setEventType(e.target.value as "pit" | "add_kart" | "remove_kart" | "breakdown")}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 text-white text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="pit">Пит-стоп команды</option>
                <option value="add_kart">Добавить карт в питлейн</option>
                <option value="remove_kart">Убрать карт из питлейна</option>
                <option value="breakdown">Поломка карта</option>
              </select>
            </div>

            {eventType === "pit" ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="teamKart" className="block text-lg font-medium text-gray-300 mb-3 text-left">
                    Команда (стартовый карт)
                  </label>
                  <select
                    id="teamKart"
                    value={teamKart}
                    onChange={(e) => setTeamKart(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 text-white text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Выберите команду...</option>
                    {Object.values(teams).map((team) => (
                      <option key={team.startKart} value={team.startKart}>
                        #{team.startKart.padStart(2, "0")} - {team.name}
                      </option>
                    ))}
                  </select>
                </div>

                {linkedHeat && teamKart && (
                  <div>
                    <label className="block text-lg font-medium text-gray-300 mb-2 text-left">
                      Круг питстопа <span className="text-gray-500 text-sm">(опционально)</span>
                    </label>
                    {teamLaps.length === 0 ? (
                      <div className="text-sm text-gray-500 bg-gray-800/40 p-3 rounded-lg border border-gray-600/30">
                        Кругов в привязанной гонке для этой команды ещё нет.
                      </div>
                    ) : (
                      <div className="bg-gray-800/40 border border-gray-600/30 rounded-lg max-h-64 overflow-y-auto">
                        <InProgressLapButton
                          startKart={teamKart}
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
            ) : eventType === "add_kart" ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="kartNumber" className="block text-lg font-medium text-gray-300 mb-3 text-left">
                    Номер карта
                  </label>
                  <input
                    id="kartNumber"
                    type="text"
                    value={kartNumber}
                    onChange={(e) => setKartNumber(e.target.value)}
                    placeholder="Введите номер карта..."
                    required
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 text-white text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor="addPosition" className="block text-lg font-medium text-gray-300 mb-3 text-left">
                    Позиция в питлейне
                  </label>
                  <select
                    id="addPosition"
                    value={addPosition}
                    onChange={(e) => setAddPosition(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 text-white text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value={-1}>В конец питлейна (по умолчанию)</option>
                    <option value={0}>1-й на выезд (в начало)</option>
                    {availableKarts.map((_, index) => (
                      <option key={index + 1} value={index + 1}>
                        {index + 2}-й на выезд (после карта #{availableKarts[index].padStart(2, "0")})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : eventType === "breakdown" ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="teamKartBreakdown" className="block text-lg font-medium text-gray-300 mb-3 text-left">
                    Команда (у которой поломка)
                  </label>
                  <select
                    id="teamKartBreakdown"
                    value={teamKart}
                    onChange={(e) => setTeamKart(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 text-white text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Выберите команду...</option>
                    {Object.values(teams).map((team) => (
                      <option key={team.startKart} value={team.startKart}>
                        #{team.startKart.padStart(2, "0")} - {team.name} (текущий карт: #{team.karts[team.karts.length - 1].padStart(2, "0")})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="newKartNumber" className="block text-lg font-medium text-gray-300 mb-3 text-left">
                    Новый карт на замену
                  </label>
                  <input
                    id="newKartNumber"
                    type="text"
                    value={newKartNumber}
                    onChange={(e) => setNewKartNumber(e.target.value)}
                    placeholder={`Введите номер нового карта... (макс: ${maxKartNumber})`}
                    required
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 text-white text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  
                  {/* Подсказка с максимальным номером */}
                  <div className="mt-2 text-sm text-blue-400 bg-blue-900/20 p-2 rounded border border-blue-600/30">
                    <div className="font-medium mb-1">💡 Подсказка:</div>
                    <div>Максимальный номер карта в гонке: <strong>#{maxKartNumber.toString().padStart(2, "0")}</strong></div>
                    <div className="mt-1">Рекомендуемые новые номера: {suggestedKartNumbers.map(num => `#${num.toString().padStart(2, "0")}`).join(", ")}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label htmlFor="kartPosition" className="block text-lg font-medium text-gray-300 mb-3 text-left">
                  Карт для удаления
                </label>
                <select
                  id="kartPosition"
                  value={selectedKartPosition}
                  onChange={(e) => setSelectedKartPosition(Number(e.target.value))}
                  required
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 text-white text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={-1}>Выберите карт для удаления...</option>
                  {availableKarts.map((kart, index) => (
                    <option key={index} value={index}>
                      {index === 0 ? "1-й на выезд" : index === 1 ? "2-й на выезд" : index === 2 ? "3-й на выезд" : `${index + 1}-й на выезд`} - Карт #{kart.padStart(2, "0")}
                    </option>
                  ))}
                </select>
                
                {availableKarts.length === 0 && (
                  <div className="mt-2 text-sm text-yellow-400 bg-yellow-900/20 p-2 rounded border border-yellow-600/30">
                    В питлейне {String.fromCharCode(65 + lane)} нет картов для удаления
                  </div>
                )}
              </div>
            )}

            {raceData.pitlanesCount > 1 && eventType !== "breakdown" && (
              <div>
                <label htmlFor="lane" className="block text-lg font-medium text-gray-300 mb-3 text-left">
                  Питлейн
                </label>
                <select
                  id="lane"
                  value={lane}
                  onChange={(e) => setLane(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 text-white text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {Array.from({ length: raceData.pitlanesCount }, (_, i) => (
                    <option key={i} value={i}>
                      Питлейн {String.fromCharCode(65 + i)} ({i + 1})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Описание события */}
            <div className="text-sm text-gray-400 bg-gray-800/50 p-3 rounded-lg border border-gray-600/30">
              {eventType === "pit" && (
                <div>
                  <strong>Пит-стоп команды:</strong> Текущий карт команды заезжает в питлейн, 
                  команда продолжает с первым картом из питлейна.
                </div>
              )}
              {eventType === "add_kart" && (
                <div>
                  <strong>Добавить карт в питлейн:</strong> Указанный карт добавляется 
                  {addPosition === -1 ? " в конец питлейна" : 
                   addPosition === 0 ? " в начало питлейна (1-й на выезд)" :
                   ` на позицию ${addPosition + 1} (${addPosition + 1}-й на выезд)`} 
                  (например, когда привозят дополнительный карт).
                </div>
              )}
              {eventType === "remove_kart" && (
                <div>
                  <strong>Убрать карт из питлейна:</strong> Выберите карт по позиции от выезда 
                  из текущего состояния питлейна (например, когда убирают поломанный карт).
                </div>
              )}
              {eventType === "breakdown" && (
                <div>
                  <strong>Поломка карта:</strong> Текущий карт команды сломался на треке и ЗАМЕНЯЕТСЯ новым картом.
                  Команда продолжает гонку с новым картом. Питлейн не задействован. Количество картов не изменяется.
                </div>
              )}
            </div>

            {/* Предварительный просмотр питлейна для добавления карта */}
            {eventType === "add_kart" && kartNumber.trim() && (
              <div className="text-sm bg-green-800/50 p-3 rounded-lg border border-green-600/30">
                <div className="font-medium text-green-300 mb-2">
                  Питлейн {String.fromCharCode(65 + lane)} после добавления:
                </div>
                <div className="flex gap-2 flex-wrap">
                  {(() => {
                    const newPitlane = [...availableKarts];
                    const insertPos = addPosition === -1 ? newPitlane.length : addPosition;
                    newPitlane.splice(insertPos, 0, kartNumber.trim());
                    
                    return newPitlane.map((kart, index) => (
                      <div 
                        key={index} 
                        className={`px-2 py-1 rounded text-xs ${
                          kart === kartNumber.trim() 
                            ? 'bg-green-600 text-white font-bold' 
                            : 'bg-green-700 text-green-300'
                        }`}
                      >
                        {index + 1}. #{kart.padStart(2, "0")}
                      </div>
                    ));
                  })()}
                </div>
                <div className="text-xs text-green-400 mt-2">
                  Новый карт подсвечен. Позиция 1 = первый на выезд
                </div>
              </div>
            )}

            {/* Информация о поломке карта */}
            {eventType === "breakdown" && teamKart && newKartNumber.trim() && teams[teamKart] && (
              <div className="text-sm bg-orange-800/50 p-3 rounded-lg border border-orange-600/30">
                <div className="font-medium text-orange-300 mb-2">
                  Замена карта:
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-red-400">
                    Сломанный: #{teams[teamKart].karts[teams[teamKart].karts.length - 1].padStart(2, "0")}
                  </div>
                  <div className="text-orange-400">→</div>
                  <div className="text-green-400 font-bold">
                    Новый: #{newKartNumber.trim().padStart(2, "0")}
                  </div>
                </div>
                <div className="text-xs text-orange-400 mt-2">
                  Команда <strong>{teams[teamKart].name}</strong> получит новый карт ВЗАМЕН сломанного (замена 1:1)
                </div>
              </div>
            )}

            {/* Предварительный просмотр питлейна для удаления карта */}
            {eventType === "remove_kart" && availableKarts.length > 0 && (
              <div className="text-sm bg-slate-800/50 p-3 rounded-lg border border-slate-600/30">
                <div className="font-medium text-slate-300 mb-2">
                  Текущее состояние питлейна {String.fromCharCode(65 + lane)}:
                </div>
                <div className="flex gap-2 flex-wrap">
                  {availableKarts.map((kart, index) => (
                    <div 
                      key={index} 
                      className={`px-2 py-1 rounded text-xs ${
                        selectedKartPosition === index 
                          ? 'bg-red-600 text-white' 
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {index + 1}. #{kart.padStart(2, "0")}
                    </div>
                  ))}
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  Позиция 1 = первый на выезд, позиция {availableKarts.length} = последний на выезд
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-4 justify-center pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-8 py-3 text-gray-300 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors duration-200 min-w-[120px]"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!canSubmit()}
              className={`px-8 py-3 rounded-lg transition-colors duration-200 min-w-[120px] ${
                canSubmit()
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              Добавить
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}