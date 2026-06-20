import { useState } from "react";
import Event from "@/app/mega-secret-pits/Event";
import PlusIcon from "./icons/PlusIcon";
import AddEventModal from "./AddEventModal";
import { useRaceStore } from "@/app/mega-secret-pits/store/useRaceStore";

interface EventsSectionProps {
  onKartClick?: (kartNumber: string) => void;
}

export default function EventsSection({ onKartClick }: EventsSectionProps) {
  const events = useRaceStore((s) => s.events);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [insertIndex, setInsertIndex] = useState(-1);
  const [filterTeam, setFilterTeam] = useState<string | null>(null);

  const handleAddEvent = (index: number) => {
    setInsertIndex(index);
    setIsAddModalOpen(true);
  };

  if (!events) return null;

  // Teams that appear in events (pit/breakdown carry team info), for the filter
  // dropdown — start-kart → name, sorted by start-kart.
  const teamOptions = Array.from(
    events.reduce((map, e) => {
      if (e.team) map.set(e.team.startKart, e.team.name);
      return map;
    }, new Map<string, string>()),
  ).sort((a, b) => (parseInt(a[0]) || 0) - (parseInt(b[0]) || 0));

  // Keep each event's original index (needed for edit/delete + chronological number)
  // while reordering only the display. Newest first; optionally filtered to one team.
  const displayEvents = events
    .map((event, originalIndex) => ({ event, originalIndex }))
    .reverse()
    .filter(({ event }) => filterTeam === null || event.team?.startKart === filterTeam);
  const isFiltered = filterTeam !== null;

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-white/10 shadow-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg flex items-center justify-center">⚡</div>
          <h2 className="text-lg sm:text-xl font-bold text-white">События</h2>
          <div className="hidden sm:block flex-1 h-px bg-gradient-to-r from-white/20 to-transparent ml-4"></div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filterTeam ?? ""}
            onChange={(e) => setFilterTeam(e.target.value || null)}
            className="rounded-lg border border-white/10 bg-gray-800 text-white text-xs sm:text-sm px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
            title="Фильтр по команде"
          >
            <option value="">Все команды</option>
            {teamOptions.map(([startKart, name]) => (
              <option key={startKart} value={startKart}>
                {startKart.padStart(2, "0")} · {name}
              </option>
            ))}
          </select>
          <div className="text-xs sm:text-sm text-gray-400">
            {isFiltered ? `Показано: ${displayEvents.length}` : `Всего: ${events.length}`} • Сначала новые
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Add button before first event (end of chronology) */}
        <div className="flex justify-center">
          <button
            onClick={() => handleAddEvent(-1)}
            className="group flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 text-gray-300 hover:text-white rounded-lg transition-all duration-200 border-2 border-dashed border-green-600 hover:border-green-500"
            title="Добавить событие в конец хронологии (новое событие)"
          >
            <PlusIcon className="w-4 h-4" />
            <span className="text-sm">Добавить новое событие</span>
          </button>
        </div>

        {/* Events grid - только события */}
        <div className="relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {displayEvents.map(({ event, originalIndex }) => (
              <div key={`event-${originalIndex}`} className="relative group/event">
                <Event
                  event={event}
                  eventIndex={originalIndex}
                  eventNumber={originalIndex + 1}
                  onKartClick={onKartClick}
                />
                {/* Floating add button before each event — full chronology only */}
                {!isFiltered && originalIndex > 0 && (
                  <button
                    onClick={() => handleAddEvent(originalIndex)}
                    className="absolute -bottom-2 -right-2 w-6 h-6 bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white rounded-full transition-all duration-200 border border-dashed border-gray-600 hover:border-gray-500 flex items-center justify-center opacity-70 hover:opacity-100 z-10"
                    title={`Добавить событие перед #${originalIndex + 1}`}
                  >
                    <PlusIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Floating add button for adding to chronological start */}
          {!isFiltered && events.length > 0 && (
            <div className="flex justify-center mt-4">
              <button
                onClick={() => handleAddEvent(0)}
                className="w-8 h-8 bg-blue-700 hover:bg-blue-600 text-gray-300 hover:text-white rounded-full transition-all duration-200 border border-dashed border-blue-600 hover:border-blue-500 flex items-center justify-center"
                title="Добавить событие в начало хронологии (историческое событие)"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      <AddEventModal isOpen={isAddModalOpen} insertIndex={insertIndex} onClose={() => setIsAddModalOpen(false)} />
    </div>
  );
}
