"use client";

import { useEffect, useState } from "react";
import PitsSection from "./components/PitsSection";
import TeamsList from "./components/TeamsList";
import EventsSection from "./components/EventsSection";
import AddEventModal from "./components/AddEventModal";
import PlusIcon from "./components/icons/PlusIcon";
import APLogo from "./components/icons/APLogo";
import RefreshIcon from "./components/icons/RefreshIcon";
import TrashAllIcon from "./components/icons/TrashAllIcon";
import ClearDataModal from "./components/ClearDataModal";
import LoadTestDataModal from "./components/LoadTestDataModal";
import KartModal from "./components/KartModal";
import RaceSettingsModal from "./components/RaceSettingsModal";
import RaceTimer from "./components/RaceTimer";
import ImportTeamsModal from "./components/ImportTeamsModal";
import { useRaceStore } from "./store/useRaceStore";
import { RaceSettings } from "./types";
import { useRoomStore } from "./rooms/useRoomStore";
import { RoomsModal } from "./rooms/RoomsModal";
import { RoomBanner } from "./rooms/RoomBanner";
import { RoomToast } from "./rooms/Toast";
import { useLinkedHeatStore } from "./linked-heat/useLinkedHeatStore";
import { LinkedHeatModal } from "./linked-heat/LinkedHeatModal";
import { LinkedHeatBanner } from "./linked-heat/LinkedHeatBanner";

export default function Pits() {
  const { raceData, pitlane, teams, events, loadInitialData, clearRaceData, loadTestData, updateRaceSettings, getRaceSettings } = useRaceStore();
  const { bootstrap, currentRoomId, currentRoom, sessionId } = useRoomStore();
  const linkedHeatId = useRaceStore((s) => s.raceData?.linkedHeatId ?? null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isLoadTestModalOpen, setIsLoadTestModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isRoomsModalOpen, setIsRoomsModalOpen] = useState(false);
  const [isLinkedHeatModalOpen, setIsLinkedHeatModalOpen] = useState(false);
  const [isAddEventModalOpen, setIsAddEventModalOpen] = useState(false);
  const [selectedKart, setSelectedKart] = useState<string | null>(null);
  const isViewer = !!currentRoomId && currentRoom?.ownerSessionId !== sessionId;

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
    return useLinkedHeatStore.getState().attachWatch();
  }, []);

  const handleClearData = () => {
    clearRaceData();
    setIsClearModalOpen(false);
  };

  const handleLoadTestData = () => {
    loadTestData();
    setIsLoadTestModalOpen(false);
  };

  const handleSaveSettings = (settings: RaceSettings) => {
    updateRaceSettings(settings);
  };

  const handleKartClick = (kartNumber: string) => {
    setSelectedKart(kartNumber);
  };

  const handleCloseKartModal = () => {
    setSelectedKart(null);
  };

  const handleExportPDF = () => {
    if (!teams || !raceData || !pitlane || !events) {
      alert("Не хватает данных для экспорта PDF");
      return;
    }

    // Снимок данных привязанной гонки (если есть)
    const { heat: linkedHeat, lapsByKart } = useLinkedHeatStore.getState();
    const linkedLapsByKart: Record<string, unknown[]> = {};
    lapsByKart.forEach((laps, kart) => {
      linkedLapsByKart[kart] = laps;
    });

    // Сохраняем данные для PDF страницы
    localStorage.setItem('pdf-export-data', JSON.stringify({
      teams,
      events,
      raceData,
      pitlane,
      linkedHeat: linkedHeat ? { id: linkedHeat.id, name: linkedHeat.name } : null,
      linkedLapsByKart: linkedHeat ? linkedLapsByKart : null,
    }));

    // Открываем новую страницу для PDF
    window.open('/mega-secret-pits/pdf', '_blank');
  };

  if (!raceData || !pitlane || !teams || !events) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mb-4"></div>
          <div className="text-white text-lg font-medium">Загрузка данных гонки...</div>
          <div className="text-orange-300 text-sm mt-2">Подготовка питлейна и команд</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <RoomBanner />
      <LinkedHeatBanner isViewer={isViewer} />
      {/* Header */}
      <header className="relative z-10 bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <APLogo width={32} height={32} className="rounded-lg shadow-lg" />
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white">
                  {getRaceSettings()?.raceName || "Ace of Pace - Controlling Panel"}
                </h1>
                <p className="text-orange-300 text-xs sm:text-sm">
                  {getRaceSettings()?.raceName ? "Ace of Pace - Controlling Panel" : "Обогнать грипов сквозь дождь и кучу дров"}
                </p>
              </div>
            </div>
            
            {/* Stats - скрыты на малых экранах, показаны на планшетах и больше */}
            <div className="hidden md:flex items-center gap-4 text-sm text-gray-300">
              <div>Команды: {Object.keys(teams).length}</div>
              <div className="text-gray-400">|</div>
              <div>События: {events.length}</div>
            </div>
            
            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button
                onClick={() => setIsRoomsModalOpen(true)}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors duration-200 text-xs"
                title="Rooms"
              >
                <span>🏠</span>
                <span className="hidden sm:inline">Rooms</span>
              </button>
              <button
                onClick={() => setIsLinkedHeatModalOpen(true)}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md transition-colors duration-200 text-xs"
                title="Linked heat"
              >
                <span>🔗</span>
                <span className="hidden sm:inline">Heat</span>
                {linkedHeatId && <span className="ml-0.5 inline-block w-1.5 h-1.5 bg-green-400 rounded-full" />}
              </button>
              <button
                onClick={() => setIsImportModalOpen(true)}
                disabled={isViewer}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors duration-200 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                title="Импорт команд из текста"
              >
                <span className="hidden sm:inline">📥</span>
                <span className="hidden sm:inline">Импорт</span>
                <span className="sm:hidden">📥</span>
              </button>
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                disabled={isViewer}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors duration-200 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                title="Настройки гонки"
              >
                <span className="hidden sm:inline">⚙️</span>
                <span className="hidden sm:inline">Настройки</span>
                <span className="sm:hidden">⚙️</span>
              </button>
              <a
                href="/mega-secret-pits/mobile"
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md transition-colors duration-200 text-xs font-bold"
                title="Мобильный режим с drag&drop"
              >
                <span className="hidden sm:inline">📱</span>
                <span className="text-xs sm:text-xs">МОБИЛЬНЫЙ</span>
              </a>
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-200 text-xs"
                title="Экспорт отчета в PDF"
              >
                <span className="hidden sm:inline">📄</span>
                <span className="hidden sm:inline">PDF</span>
                <span className="sm:hidden">📄</span>
              </button>
              <button
                onClick={() => setIsLoadTestModalOpen(true)}
                disabled={isViewer}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-md transition-colors duration-200 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                title="Загрузить тестовые данные"
              >
                <RefreshIcon className="w-3 h-3" />
                <span className="hidden sm:inline">Тест</span>
              </button>
              <button
                onClick={() => setIsClearModalOpen(true)}
                disabled={isViewer}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors duration-200 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                title="Очистить все данные"
              >
                <TrashAllIcon className="w-3 h-3" />
                <span className="hidden sm:inline">Очистить</span>
              </button>
            </div>
          </div>
          
          {/* Mobile stats */}
          <div className="md:hidden flex items-center justify-center gap-4 text-xs text-gray-400 mt-2 pt-2 border-t border-white/10">
            <div>Команды: {Object.keys(teams).length}</div>
            <div>•</div>
            <div>События: {events.length}</div>
          </div>
        </div>
      </header>

      {/* Race Timer */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-4">
        <RaceTimer />
      </div>

      {/* Race info section */}
      {(getRaceSettings()?.raceName || getRaceSettings()?.raceComments) && (
        <div className="relative z-10 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-b border-blue-500/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
            {/* Название заезда */}
            {getRaceSettings()?.raceName && (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-blue-400">🏁</div>
                  <h2 className="text-lg font-bold text-blue-200">Название заезда</h2>
                </div>
                <p className="text-white text-base font-medium ml-6">
                  {getRaceSettings()?.raceName}
                </p>
              </div>
            )}
            
            {/* Комментарии к гонке */}
            {getRaceSettings()?.raceComments && (
              <div className={getRaceSettings()?.raceName ? "border-t border-blue-500/20 pt-3" : ""}>
                <div className="flex items-start gap-3">
                  <div className="text-yellow-400 mt-1">💬</div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-yellow-200 mb-2">Комментарии к гонке</h3>
                    <div className="bg-yellow-900/20 rounded-lg p-3 border border-yellow-500/30">
                      <p className="text-yellow-100 text-sm whitespace-pre-wrap leading-relaxed">
                        {getRaceSettings()?.raceComments}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className={`relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8 transition-opacity ${isViewer ? 'opacity-70 select-none' : ''}`}>
        <div className="flex flex-col gap-8 sm:gap-12 lg:gap-16">
          <PitsSection onKartClick={handleKartClick} />
          <TeamsList onKartClick={handleKartClick} />
          <EventsSection onKartClick={handleKartClick} />
        </div>
      </main>

      {/* Floating "Add event" FAB */}
      {!isViewer && (
        <button
          onClick={() => setIsAddEventModalOpen(true)}
          className="fixed bottom-6 right-6 z-20 w-14 h-14 rounded-full bg-green-600 hover:bg-green-500 active:bg-green-700 text-white shadow-2xl shadow-green-900/40 ring-1 ring-green-400/30 flex items-center justify-center transition-colors"
          title="Добавить событие"
          aria-label="Добавить событие"
        >
          <PlusIcon className="w-7 h-7" />
        </button>
      )}

      {/* Footer */}
      <footer className="relative z-10 mt-8 sm:mt-16 bg-black/20 backdrop-blur-sm border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 text-center text-gray-400 text-xs sm:text-sm">
          <div className="flex items-center justify-center gap-2">
            <span>Ace of Pace</span>
            <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
            <span>Controlling Panel</span>
          </div>
        </div>
      </footer>

        {/* Modals */}
        <ImportTeamsModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
        />
        <ClearDataModal
          isOpen={isClearModalOpen}
          onClose={() => setIsClearModalOpen(false)}
          onConfirm={handleClearData}
        />
        <LoadTestDataModal
          isOpen={isLoadTestModalOpen}
          onClose={() => setIsLoadTestModalOpen(false)}
          onConfirm={handleLoadTestData}
        />
        <RaceSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          onSave={handleSaveSettings}
          currentSettings={getRaceSettings() || undefined}
        />
        {selectedKart && (
          <KartModal
            isOpen={true}
            onClose={handleCloseKartModal}
            kartNumber={selectedKart}
          />
        )}
        <AddEventModal
          isOpen={isAddEventModalOpen}
          insertIndex={-1}
          onClose={() => setIsAddEventModalOpen(false)}
        />
        <RoomsModal open={isRoomsModalOpen} onClose={() => setIsRoomsModalOpen(false)} />
        <LinkedHeatModal
          open={isLinkedHeatModalOpen}
          onClose={() => setIsLinkedHeatModalOpen(false)}
          isViewer={isViewer}
        />
        <RoomToast />
      </div>
    );
  }
