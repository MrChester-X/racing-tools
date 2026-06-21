import { memo, useState } from "react";
import { ParsedRaceEvent } from "@/app/mega-secret-pits/types";
import { Utils } from "@/utils/Utils";
import KartChangeIcon from "./components/icons/KartChangeIcon";
import TrashIcon from "./components/icons/TrashIcon";
import EditIcon from "./components/icons/EditIcon";
import DeleteEventModal from "./components/DeleteEventModal";
import EditPitEventModal from "./components/EditPitEventModal";
import PitlaneVisualization from "./components/PitlaneVisualization";
import Kart from "./Kart";
import { useRaceStore } from "./store/useRaceStore";
import { usePitLapDelta } from "./linked-heat/usePitLapDelta";

function EventTime({ timestamp }: { timestamp?: number }) {
  const getRaceTimer = useRaceStore((s) => s.getRaceTimer);
  const timer = getRaceTimer();
  const raceTime = Utils.formatRaceTime(timestamp, timer.startTime);
  if (!raceTime) return null;
  return (
    <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs font-mono px-1.5 py-0.5 rounded">
      {raceTime}
    </div>
  );
}

interface EventProps {
  event: ParsedRaceEvent;
  eventIndex: number;
  eventNumber: number;
  onKartClick?: (kartNumber: string) => void;
}

// "Под красный XX.XX секунд" — how much slower this pit's lap-with-pit was than the
// fastest lap-with-pit in the whole race. The fastest pit lap is the baseline (0.00).
function UnderRedBadge({ event }: { event: ParsedRaceEvent }) {
  const delta = usePitLapDelta(event);
  if (!delta) return null;
  return (
    <div
      className="mt-1 inline-flex items-center gap-1 rounded-md bg-red-900/50 px-2 py-0.5 text-xs font-semibold text-red-100"
      title={`Время круга с питом ${(delta.lapTimeMs / 1000).toFixed(2)}с · лучший круг с питом ${(delta.minLapTimeMs / 1000).toFixed(2)}с`}
    >
      🚩 Под красный {(delta.deltaMs / 1000).toFixed(2)} секунд
    </div>
  );
}

const Event = ({ event, eventIndex, eventNumber, onKartClick }: EventProps) => {
  const deleteEvent = useRaceStore((s) => s.deleteEvent);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const handleDeleteConfirm = () => {
    deleteEvent(eventIndex);
    setIsDeleteModalOpen(false);
  };

  if (event.type === "pit" && event.team && event.pitCount) {
    return (
      <>
        <div className="group relative bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 rounded-xl p-3 shadow-lg hover:shadow-xl hover:shadow-orange-500/25 transition-all duration-200 w-full overflow-hidden">
          {/* Event number badge in corner */}
          <div className="absolute top-0 right-0 bg-red-800/90 text-orange-100 text-xs font-bold px-2 py-1 rounded-bl-lg backdrop-blur-sm">
            #{eventNumber} ({eventIndex})
          </div>

          {/* Action buttons in top-left corner */}
          <div className="absolute top-2 left-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="p-1 text-orange-200 hover:text-blue-300 hover:bg-blue-500/20 rounded transition-all duration-200"
              title="Редактировать пит (изменить круг)"
            >
              <EditIcon className="w-3 h-3" />
            </button>
            <button
              onClick={() => setIsDeleteModalOpen(true)}
              className="p-1 text-orange-200 hover:text-red-300 hover:bg-red-500/20 rounded transition-all duration-200"
              title="Удалить событие"
            >
              <TrashIcon className="w-3 h-3" />
            </button>
          </div>

          {/* Header */}
          <div className="flex items-center justify-center mb-2">
            <div className="flex items-center gap-1.5">
              <KartChangeIcon className="w-4 h-4 text-orange-100" />
              <span className="text-orange-100 font-medium text-sm">Пит #{event.pitCount}</span>
            </div>
          </div>

          {/* Team info */}
          <div className="mb-2">
            <div className="text-white font-bold text-base">
              <span className="text-yellow-300">{event.team.startKart.padStart(2, "0")}</span> {event.team.name}
            </div>
            <div className="text-orange-100 text-xs">
              Питлейн {Utils.getLaneLetter(event.lane)} • Команда #{event.team.startKart.padStart(2, "0")}
              {typeof event.lapNumber === "number" && (
                <span className="ml-1 text-cyan-200">• 🔗 Lap {event.lapNumber}</span>
              )}
            </div>
            <UnderRedBadge event={event} />
          </div>

          {/* Kart change */}
          <div className="flex items-center justify-center gap-2 bg-red-700/30 rounded-lg p-2">
            <div className="text-center flex flex-col items-center">
              <div className="text-orange-200 text-xs mb-1">Заезжает</div>
              <Kart kart={event.team.karts[event.pitCount - 1]} onKartClick={onKartClick} />
            </div>
            <KartChangeIcon className="w-5 h-5 text-orange-200" />
            <div className="text-center flex flex-col items-center">
              <div className="text-orange-200 text-xs mb-1">Выезжает</div>
              <Kart kart={event.team.karts[event.pitCount]} onKartClick={onKartClick} />
            </div>
          </div>

          {/* Pitlane visualization */}
          <PitlaneVisualization event={event} eventIndex={eventIndex} onKartClick={onKartClick} />
          <EventTime timestamp={event.timestamp} />
        </div>

        <DeleteEventModal
          isOpen={isDeleteModalOpen}
          eventToDelete={event}
          eventIndex={eventIndex}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleDeleteConfirm}
        />

        <EditPitEventModal
          isOpen={isEditModalOpen}
          event={event}
          eventIndex={eventIndex}
          onClose={() => setIsEditModalOpen(false)}
        />
      </>
    );
  }

  if (event.type === "add_kart") {
    return (
      <>
        <div className="group relative bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-xl p-3 shadow-lg hover:shadow-xl hover:shadow-green-500/25 transition-all duration-200 w-full overflow-hidden">
          {/* Event number badge in corner */}
          <div className="absolute top-0 right-0 bg-green-800/90 text-green-100 text-xs font-bold px-2 py-1 rounded-bl-lg backdrop-blur-sm">
            #{eventNumber} ({eventIndex})
          </div>

          {/* Delete button in top-left corner */}
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 p-1 text-green-200 hover:text-red-300 hover:bg-red-500/20 rounded transition-all duration-200 z-10"
            title="Удалить событие"
          >
            <TrashIcon className="w-3 h-3" />
          </button>

          {/* Header */}
          <div className="flex items-center justify-center mb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 text-green-100">+</div>
              <span className="text-green-100 font-medium text-sm">Добавить карт</span>
            </div>
          </div>

          {/* Kart info */}
          <div className="mb-2 text-center">
            <div className="text-white font-bold text-base mb-1">Карт #{event.kart.padStart(2, "0")}</div>
            <div className="text-green-100 text-xs">Добавлен в питлейн {Utils.getLaneLetter(event.lane)}</div>
          </div>

          {/* Kart display */}
          <div className="flex items-center justify-center bg-green-700/30 rounded-lg p-2">
            <Kart kart={event.kart} onKartClick={onKartClick} />
          </div>

          {/* Pitlane visualization */}
          <PitlaneVisualization event={event} eventIndex={eventIndex} onKartClick={onKartClick} />
          <EventTime timestamp={event.timestamp} />
        </div>

        <DeleteEventModal
          isOpen={isDeleteModalOpen}
          eventToDelete={event}
          eventIndex={eventIndex}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleDeleteConfirm}
        />
      </>
    );
  }

  if (event.type === "remove_kart") {
    return (
      <>
        <div className="group relative bg-gradient-to-r from-gray-600 to-slate-600 hover:from-gray-500 hover:to-slate-500 rounded-xl p-3 shadow-lg hover:shadow-xl hover:shadow-gray-500/25 transition-all duration-200 w-full overflow-hidden">
          {/* Event number badge in corner */}
          <div className="absolute top-0 right-0 bg-gray-800/90 text-gray-100 text-xs font-bold px-2 py-1 rounded-bl-lg backdrop-blur-sm">
            #{eventNumber}
          </div>

          {/* Delete button in top-left corner */}
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 p-1 text-gray-200 hover:text-red-300 hover:bg-red-500/20 rounded transition-all duration-200 z-10"
            title="Удалить событие"
          >
            <TrashIcon className="w-3 h-3" />
          </button>

          {/* Header */}
          <div className="flex items-center justify-center mb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 text-gray-100">−</div>
              <span className="text-gray-100 font-medium text-sm">Убрать карт</span>
            </div>
          </div>

          {/* Kart info */}
          <div className="mb-2 text-center">
            <div className="text-white font-bold text-base mb-1">Карт #{event.kart.padStart(2, "0")}</div>
            <div className="text-gray-100 text-xs">Убран из питлейна {Utils.getLaneLetter(event.lane)}</div>
          </div>

          {/* Kart display */}
          <div className="flex items-center justify-center bg-gray-700/30 rounded-lg p-2">
            <Kart kart={event.kart} onKartClick={onKartClick} />
          </div>

          {/* Pitlane visualization */}
          <PitlaneVisualization event={event} eventIndex={eventIndex} onKartClick={onKartClick} />
          <EventTime timestamp={event.timestamp} />
        </div>

        <DeleteEventModal
          isOpen={isDeleteModalOpen}
          eventToDelete={event}
          eventIndex={eventIndex}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleDeleteConfirm}
        />
      </>
    );
  }

  if (event.type === "breakdown" && event.newKart) {
    // Для breakdown события event.kart содержит стартовый карт команды
    // replacedKart содержит номер сломанного карта
    const brokenKart = event.replacedKart || event.kart; // Если нет replacedKart, используем стартовый карт
    
    return (
      <>
        <div className="group relative bg-gradient-to-r from-orange-600 to-yellow-600 hover:from-orange-500 hover:to-yellow-500 rounded-xl p-3 shadow-lg hover:shadow-xl hover:shadow-orange-500/25 transition-all duration-200 w-full overflow-hidden">
          {/* Event number badge in corner */}
          <div className="absolute top-0 right-0 bg-yellow-800/90 text-orange-100 text-xs font-bold px-2 py-1 rounded-bl-lg backdrop-blur-sm">
            #{eventNumber} ({eventIndex})
          </div>

          {/* Delete button in top-left corner */}
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 p-1 text-orange-200 hover:text-red-300 hover:bg-red-500/20 rounded transition-all duration-200 z-10"
            title="Удалить событие"
          >
            <TrashIcon className="w-3 h-3" />
          </button>

          {/* Header */}
          <div className="flex items-center justify-center mb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 text-yellow-100">⚠</div>
              <span className="text-yellow-100 font-medium text-sm">Поломка карта</span>
            </div>
          </div>

          {/* Team info */}
          <div className="mb-2 text-center">
            {event.team ? (
              <div className="text-orange-100 text-xs mb-1">Команда: {event.team.name}</div>
            ) : (
              <div className="text-orange-100 text-xs mb-1">Стартовый карт: #{event.kart.padStart(2, "0")}</div>
            )}
            <div className="text-orange-100 text-xs">Поломка на треке (не в питлейне)</div>
            {typeof event.lapNumber === "number" && (
              <div className="text-cyan-200 text-xs mt-1">🔗 Lap {event.lapNumber}</div>
            )}
          </div>

          {/* Kart replacement */}
          <div className="flex items-center justify-center gap-2 bg-yellow-700/30 rounded-lg p-2">
            <div className="text-center flex flex-col items-center">
              <div className="text-yellow-200 text-xs mb-1">Сломанный</div>
              <Kart kart={brokenKart} onKartClick={onKartClick} />
            </div>
            <div className="w-5 h-5 text-yellow-200">→</div>
            <div className="text-center flex flex-col items-center">
              <div className="text-yellow-200 text-xs mb-1">Замена</div>
              <Kart kart={event.newKart} onKartClick={onKartClick} />
            </div>
          </div>

          {/* Breakdown events don't affect pitlane, so no visualization needed */}
          <EventTime timestamp={event.timestamp} />
        </div>

        <DeleteEventModal
          isOpen={isDeleteModalOpen}
          eventToDelete={event}
          eventIndex={eventIndex}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleDeleteConfirm}
        />
      </>
    );
  }

  return null;
};

export default memo(Event);
