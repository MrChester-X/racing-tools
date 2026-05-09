import { useState } from "react";
import Event from "@/app/mega-secret-pits/Event";
import PlusIcon from "./icons/PlusIcon";
import AddEventModal from "./AddEventModal";
import { useRaceStore } from "@/app/mega-secret-pits/store/useRaceStore";

interface EventsSectionProps {
  onKartClick?: (kartNumber: string) => void;
}

export default function EventsSection({ onKartClick }: EventsSectionProps) {
  const { events } = useRaceStore();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [insertIndex, setInsertIndex] = useState(-1);

  const handleAddEvent = (index: number) => {
    setInsertIndex(index);
    setIsAddModalOpen(true);
  };

  if (!events) return null;

  // Reverse events to show latest first
  const reversedEvents = [...events].reverse();

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-white/10 shadow-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg flex items-center justify-center">⚡</div>
          <h2 className="text-lg sm:text-xl font-bold text-white">События</h2>
          <div className="hidden sm:block flex-1 h-px bg-gradient-to-r from-white/20 to-transparent ml-4"></div>
        </div>
        <div className="text-xs sm:text-sm text-gray-400">Всего: {events.length} • Показаны сначала новые</div>
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
            {reversedEvents.map((event, displayIndex) => {
              const originalIndex = reversedEvents.length - 1 - displayIndex;
              return (
                <div key={`event-${originalIndex}`} className="relative group/event">
                  <Event
                    event={event}
                    eventIndex={originalIndex}
                    eventNumber={reversedEvents.length - displayIndex}
                    onKartClick={onKartClick}
                  />
                  {/* Floating add button before each event (except last) */}
                  {displayIndex < reversedEvents.length - 1 && (
                    <button
                      onClick={() => handleAddEvent(originalIndex)}
                      className="absolute -bottom-2 -right-2 w-6 h-6 bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white rounded-full transition-all duration-200 border border-dashed border-gray-600 hover:border-gray-500 flex items-center justify-center opacity-70 hover:opacity-100 z-10"
                      title={`Добавить событие перед #${reversedEvents.length - displayIndex}`}
                    >
                      <PlusIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Floating add button for adding to chronological start */}
          {events.length > 0 && (
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
