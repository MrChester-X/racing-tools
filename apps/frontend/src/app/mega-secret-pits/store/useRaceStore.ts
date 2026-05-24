import { create } from "zustand";
import { ParsedRaceEvent, ParsedRaceTeam, RaceData, RaceTeam, RaceSettings, RaceTimer } from "@/app/mega-secret-pits/types";
import { TestRaceData } from "@/app/mega-secret-pits/const/TestRaceData";
import { useRoomStore } from "@/app/mega-secret-pits/rooms/useRoomStore";

function isViewerLocked(): boolean {
  if (typeof window === "undefined") return false;
  const { currentRoomId, currentRoom, sessionId } = useRoomStore.getState();
  return !!currentRoomId && currentRoom?.ownerSessionId !== sessionId;
}

const processPitlane = (pitlane: string[][], lane: number, team: ParsedRaceTeam) => {
  pitlane[lane].push(team.karts.at(-1) as string);
  team.karts.push(pitlane[lane][0]);
  pitlane[lane].shift();
};

const addKartToPitlane = (pitlane: string[][], lane: number, kart: string, position?: number) => {
  // Добавляем карт в указанную позицию или в конец питлейна
  if (position === undefined || position === -1) {
    // В конец питлейна (по умолчанию)
    pitlane[lane].push(kart);
  } else {
    // В указанную позицию
    pitlane[lane].splice(position, 0, kart);
  }
};

const removeKartFromPitlane = (pitlane: string[][], lane: number, kart: string) => {
  // Удаляем карт из питлейна
  const index = pitlane[lane].indexOf(kart);
  if (index !== -1) {
    pitlane[lane].splice(index, 1);
  }
};

const replaceKartInPitlane = (pitlane: string[][], lane: number, oldKart: string, newKart: string) => {
  // Заменяем карт в питлейне на новый (поломка)
  const index = pitlane[lane].indexOf(oldKart);
  if (index !== -1) {
    pitlane[lane][index] = newKart;
  }
};

interface RaceStore {
  // Core race data
  raceData: RaceData | null;
  pitlane: string[][] | null;
  teams: { [startKart: string]: ParsedRaceTeam } | null;
  events: ParsedRaceEvent[] | null;

  // UI state
  focusKart: string | null;

  // Undo functionality
  undoHistory: RaceData[];

  // Actions
  setRaceData: (data: RaceData) => void;
  loadInitialData: () => void;
  saveRaceData: () => void;

  // Kart actions
  setFocusKart: (kart: string | null) => void;
  setKartColors: (colors: { [kart: string]: number }) => void;
  setKartComments: (comments: { [kart: string]: string }) => void;

  // Team actions
  addTeam: (name: string, startKart: string) => boolean;
  renameTeam: (startKart: string, name: string) => boolean;
  deleteTeam: (team: ParsedRaceTeam) => void;

  // Event actions
  addEvent: (
    eventType: "pit" | "add_kart" | "remove_kart" | "breakdown",
    kart: string,
    lane: number,
    insertIndex: number,
    position?: number,
    newKart?: string,
    lapNumber?: number,
  ) => boolean;
  deleteEvent: (eventIndex: number) => void;
  updatePitEventLap: (eventIndex: number, lapNumber: number | null) => void;

  // Undo functionality
  undoLastAction: () => boolean;

  // Data management actions
  clearRaceData: () => void;
  loadTestData: () => void;

  // Race settings actions
  updateRaceSettings: (settings: RaceSettings) => void;
  getRaceSettings: () => RaceSettings | null;

  // Race timer actions
  startRace: () => void;
  stopRace: () => void;
  resetRaceTimer: () => void;
  getRaceTimer: () => RaceTimer;

  // Helper functions
  getPitlaneStateAtEvent: (eventIndex: number) => string[][] | null;
}

export const useRaceStore = create<RaceStore>((set, get) => ({
  // Initial state
  raceData: null,
  pitlane: null,
  teams: null,
  events: null,
  focusKart: null,
  undoHistory: [],

  // Core data actions
  setRaceData: (data: RaceData) => {
    // Нормализуем входящие данные: пустая комната приходит как {} и валит компоненты на data.events.length
    data = {
      ...data,
      events: data.events ?? [],
      teams: data.teams ?? [],
      pitlanesCount: data.pitlanesCount ?? 0,
      startPitlane: data.startPitlane ?? [],
      kartColors: data.kartColors || {},
      kartComments: data.kartComments || {},
    };

    set({ raceData: data });

    // Process the data
    const newTeams: { [startKart: string]: ParsedRaceTeam } = structuredClone(data.teams).reduce(
      (acc, team) => ({
        ...acc,
        [team.startKart]: { ...team, karts: [team.startKart] },
      }),
      {},
    );

    const newPitlane = structuredClone(data.startPitlane);
    const newEvents: ParsedRaceEvent[] = [];

    for (const event of data.events) {
      if (event.type === "pit") {
        const team = newTeams[event.kart];
        if (team) {
          processPitlane(newPitlane, event.lane, team);
          newEvents.push({
            ...event,
            team,
            pitCount: team.karts.length - 1,
            timestamp: event.timestamp,
          });
        }
      } else if (event.type === "add_kart") {
        addKartToPitlane(newPitlane, event.lane, event.kart, event.position);
        newEvents.push({
          ...event,
          timestamp: event.timestamp,
          position: event.position,
        });
      } else if (event.type === "remove_kart") {
        removeKartFromPitlane(newPitlane, event.lane, event.kart);
        newEvents.push({
          ...event,
          timestamp: event.timestamp,
        });
      } else if (event.type === "breakdown") {
        // Для breakdown события event.kart содержит стартовый карт команды
        const team = newTeams[event.kart];
        if (team && event.newKart) {
          // ЗАМЕНЯЕМ текущий карт команды на новый (НЕ добавляем!)
          const currentKart = team.karts[team.karts.length - 1];
          team.karts[team.karts.length - 1] = event.newKart; // Замена, а не добавление
          
          // Сохраняем информацию о замене в событии
          newEvents.push({
            ...event,
            timestamp: event.timestamp,
            newKart: event.newKart,
            team: team, // Добавляем команду для отображения
            // Добавляем информацию о замененном карте для истории
            replacedKart: currentKart,
          });
        } else {
          // Если команда не найдена или newKart отсутствует, все равно сохраняем событие
          console.warn(`Breakdown event: team not found for kart ${event.kart} or newKart missing`);
          newEvents.push({
            ...event,
            timestamp: event.timestamp,
          });
        }
      }
    }

    set({
      raceData: data,
      teams: newTeams,
      pitlane: newPitlane,
      events: newEvents,
    });
  },

  loadInitialData: () => {
    const rawRaceData = localStorage.getItem("raceData");
    let raceData = rawRaceData ? (JSON.parse(rawRaceData) as RaceData) || TestRaceData : TestRaceData;
    
    // Валидация и очистка поврежденных данных
    if (raceData.events) {
      const validEventTypes = ['pit', 'add_kart', 'remove_kart', 'breakdown'];
      raceData.events = raceData.events.filter(event => {
        // Проверяем, что событие имеет правильный тип
        if (!validEventTypes.includes(event.type)) {
          console.warn('Removing invalid event with type:', event.type);
          return false;
        }
        
        // Проверяем, что kart это строка
        if (typeof event.kart !== 'string') {
          console.warn('Removing event with invalid kart type:', event.kart);
          return false;
        }
        
        // Проверяем, что lane это валидное число >= 0
        if (typeof event.lane !== 'number' || event.lane < 0) {
          console.warn('Removing event with invalid lane:', event.lane);
          return false;
        }
        
        return true;
      });
      
      console.log(`Loaded ${raceData.events.length} valid events after cleanup`);
    }
    
    get().setRaceData(raceData);
  },

  saveRaceData: () => {
    const { raceData } = get();
    if (!raceData) return;
    if (typeof window === "undefined") return;

    const room = useRoomStore.getState();
    if (room.currentRoomId) {
      if (room.currentRoom?.ownerSessionId !== room.sessionId) return;
      void room.persistData(raceData);
    } else {
      localStorage.setItem("raceData", JSON.stringify(raceData));
    }
  },

  // Kart actions
  setFocusKart: (kart: string | null) => set({ focusKart: kart }),

  setKartColors: (colors: { [kart: string]: number }) => {
    if (isViewerLocked()) return;
    const { raceData } = get();
    if (raceData) {
      const updatedRaceData = {
        ...raceData,
        kartColors: colors,
      };
      set({ raceData: updatedRaceData });
      get().saveRaceData();
    }
  },

  setKartComments: (comments: { [kart: string]: string }) => {
    if (isViewerLocked()) return;
    const { raceData } = get();
    if (raceData) {
      const updatedRaceData = {
        ...raceData,
        kartComments: comments,
      };
      set({ raceData: updatedRaceData });
      get().saveRaceData();
    }
  },

  // Team actions
  addTeam: (name: string, startKart: string): boolean => {
    if (isViewerLocked()) return false;
    const { raceData } = get();
    if (!raceData || !name || !startKart) return false;

    // Check if team with this start kart already exists
    if (raceData.teams.find((team) => team.startKart === startKart)) {
      return false; // Team already exists
    }

    const newTeam: RaceTeam = {
      name: name.trim(),
      startKart: startKart.trim(),
    };

    const updatedRaceData = {
      ...raceData,
      teams: [...raceData.teams, newTeam],
    };

    get().setRaceData(updatedRaceData);
    get().saveRaceData();
    return true; // Success
  },

  renameTeam: (startKart: string, name: string): boolean => {
    if (isViewerLocked()) return false;
    const { raceData } = get();
    if (!raceData) return false;
    const trimmed = name.trim();
    if (!trimmed) return false;

    const idx = raceData.teams.findIndex((t) => t.startKart === startKart);
    if (idx === -1) return false;
    if (raceData.teams[idx].name === trimmed) return false;

    const teams = raceData.teams.slice();
    teams[idx] = { ...teams[idx], name: trimmed };
    get().setRaceData({ ...raceData, teams });
    get().saveRaceData();
    return true;
  },

  deleteTeam: (team: ParsedRaceTeam) => {
    if (isViewerLocked()) return;
    const { raceData } = get();
    if (!raceData) return;

    const updatedRaceData = {
      ...raceData,
      teams: raceData.teams.filter((t) => t.startKart !== team.startKart),
      events: raceData.events.filter((event) => event.kart !== team.startKart),
    };

    get().setRaceData(updatedRaceData);
    get().saveRaceData();
  },

  // Event actions
  addEvent: (
    eventType: "pit" | "add_kart" | "remove_kart" | "breakdown",
    kart: string,
    lane: number,
    insertIndex: number,
    position?: number,
    newKart?: string,
    lapNumber?: number,
  ): boolean => {
    if (isViewerLocked()) return false;
    const { raceData, undoHistory } = get();
    if (!raceData) return false;

    // For pit events, check if team exists
    if (eventType === "pit") {
      const team = raceData.teams.find((t) => t.startKart === kart);
      if (!team) return false;
    }

    // Save current state to undo history before making changes
    const newUndoHistory = [structuredClone(raceData), ...undoHistory.slice(0, 2)]; // Keep only last 3 states

    // Валидация входных данных
    if (!["pit", "add_kart", "remove_kart", "breakdown"].includes(eventType)) {
      console.error("Invalid event type:", eventType);
      return false;
    }
    
    if (typeof kart !== "string" || !kart.trim()) {
      console.error("Invalid kart:", kart);
      return false;
    }
    
    if (typeof lane !== "number" || lane < 0) {
      console.error("Invalid lane:", lane);
      return false;
    }

    const newEvent = {
      type: eventType,
      kart: kart.toString().trim(), // Убеждаемся что это строка
      lane: Number(lane), // Убеждаемся что это число
      // Добавляем timestamp только если событие добавляется в конец (последним)
      ...(insertIndex === -1 && { timestamp: Date.now() }),
      // Добавляем position для add_kart событий
      ...(eventType === "add_kart" && position !== undefined && { position: Number(position) }),
      // Добавляем newKart для breakdown событий
      ...(eventType === "breakdown" && newKart && { newKart: newKart.toString().trim() }),
      // Добавляем lapNumber для pit событий, если указан
      ...(eventType === "pit" && typeof lapNumber === "number" && Number.isFinite(lapNumber) && { lapNumber }),
    };

    const newEvents = [...raceData.events];

    if (insertIndex === -1) {
      // Add to the end
      newEvents.push(newEvent);
    } else if (insertIndex >= newEvents.length) {
      // Add to the end if index is beyond array length
      newEvents.push(newEvent);
    } else {
      // Insert at specific position
      newEvents.splice(insertIndex, 0, newEvent);
    }

    const updatedRaceData = {
      ...raceData,
      events: newEvents,
    };

    set({ undoHistory: newUndoHistory });
    get().setRaceData(updatedRaceData);
    get().saveRaceData();
    return true;
  },

  deleteEvent: (eventIndex: number) => {
    if (isViewerLocked()) return;
    const { raceData, undoHistory } = get();

    if (!raceData || eventIndex < 0 || eventIndex >= raceData.events.length) {
      return;
    }

    // Save current state to undo history before making changes
    const newUndoHistory = [structuredClone(raceData), ...undoHistory.slice(0, 2)]; // Keep only last 3 states

    const newEvents = [...raceData.events];
    newEvents.splice(eventIndex, 1);

    const updatedRaceData = {
      ...raceData,
      events: newEvents,
    };

    set({ undoHistory: newUndoHistory });
    get().setRaceData(updatedRaceData);
    get().saveRaceData();
  },

  updatePitEventLap: (eventIndex: number, lapNumber: number | null) => {
    if (isViewerLocked()) return;
    const { raceData, undoHistory } = get();
    if (!raceData || eventIndex < 0 || eventIndex >= raceData.events.length) return;
    const target = raceData.events[eventIndex];
    if (target.type !== "pit") return;

    const newUndoHistory = [structuredClone(raceData), ...undoHistory.slice(0, 2)];
    const newEvents = raceData.events.map((ev, idx) => {
      if (idx !== eventIndex) return ev;
      const next = { ...ev };
      if (lapNumber === null) delete next.lapNumber;
      else next.lapNumber = lapNumber;
      return next;
    });

    set({ undoHistory: newUndoHistory });
    get().setRaceData({ ...raceData, events: newEvents });
    get().saveRaceData();
  },

  // Undo functionality
  undoLastAction: (): boolean => {
    if (isViewerLocked()) return false;
    const { undoHistory } = get();
    if (undoHistory.length === 0) return false;

    const previousState = undoHistory[0];
    const newUndoHistory = undoHistory.slice(1);

    set({ undoHistory: newUndoHistory });
    get().setRaceData(previousState);
    get().saveRaceData();
    return true;
  },

  // Data management actions
  clearRaceData: () => {
    if (isViewerLocked()) return;
    const { raceData } = get();
    if (!raceData) return;

    const clearedData: RaceData = {
      ...raceData,
      events: [],
      teams: [],
      kartColors: {}, // Специально сбрасываем цвета при очистке
      kartComments: {}, // Специально сбрасываем комментарии при очистке
    };

    set({ undoHistory: [] }); // Очищаем историю отмены
    get().setRaceData(clearedData);
    get().saveRaceData();
  },

  loadTestData: () => {
    if (isViewerLocked()) return;
    get().setRaceData(TestRaceData);
    get().saveRaceData();
  },

  // Race settings actions
  updateRaceSettings: (settings: RaceSettings) => {
    if (isViewerLocked()) return;
    const { raceData } = get();
    if (!raceData) return;

    const prevMin = raceData.settings?.minLapTimeSec;
    const updatedRaceData = {
      ...raceData,
      settings,
      // Обновляем основные параметры из настроек
      pitlanesCount: settings.pitlanesCount,
      startPitlane: settings.startPitlane,
    };

    get().setRaceData(updatedRaceData);
    get().saveRaceData();

    // If the min-lap-time filter changed, derived maps (bestByKart, etc.)
    // in the linked-heat store need to be recomputed from raw lapsByKart.
    if (prevMin !== settings.minLapTimeSec) {
      // Dynamic import to avoid a circular dependency between stores.
      import("../linked-heat/useLinkedHeatStore").then(({ useLinkedHeatStore }) => {
        useLinkedHeatStore.getState().rebuildDerivedMaps();
      });
    }
  },

  getRaceSettings: (): RaceSettings | null => {
    const { raceData } = get();
    if (!raceData) return null;
    return raceData.settings || {
      raceName: undefined,
      pitlanesCount: raceData.pitlanesCount,
      startPitlane: raceData.startPitlane,
      raceComments: undefined,
    };
  },

  // Race timer actions
  startRace: () => {
    if (isViewerLocked()) return;
    const { raceData } = get();
    if (!raceData) return;
    const timer: RaceTimer = {
      startTime: Date.now(),
      endTime: null,
      isRunning: true,
    };
    const updatedRaceData = { ...raceData, timer };
    set({ raceData: updatedRaceData });
    get().saveRaceData();
  },

  stopRace: () => {
    if (isViewerLocked()) return;
    const { raceData } = get();
    if (!raceData || !raceData.timer?.isRunning) return;
    const timer: RaceTimer = {
      ...raceData.timer,
      endTime: Date.now(),
      isRunning: false,
    };
    const updatedRaceData = { ...raceData, timer };
    set({ raceData: updatedRaceData });
    get().saveRaceData();
  },

  resetRaceTimer: () => {
    if (isViewerLocked()) return;
    const { raceData } = get();
    if (!raceData) return;
    const timer: RaceTimer = {
      startTime: null,
      endTime: null,
      isRunning: false,
    };
    const updatedRaceData = { ...raceData, timer };
    set({ raceData: updatedRaceData });
    get().saveRaceData();
  },

  getRaceTimer: (): RaceTimer => {
    const { raceData } = get();
    return raceData?.timer || { startTime: null, endTime: null, isRunning: false };
  },

  // Helper functions
  getPitlaneStateAtEvent: (eventIndex: number): string[][] | null => {
    const { raceData } = get();
    if (!raceData) return null;

    // Начинаем с исходного состояния питлейна
    const simulatedPitlane = structuredClone(raceData.startPitlane);
    const simulatedTeams: { [startKart: string]: ParsedRaceTeam } = structuredClone(raceData.teams).reduce(
      (acc, team) => ({
        ...acc,
        [team.startKart]: { ...team, karts: [team.startKart] },
      }),
      {},
    );

    // Применяем все события до указанного индекса
    for (let i = 0; i < eventIndex && i < raceData.events.length; i++) {
      const event = raceData.events[i];

      if (event.type === "pit") {
        const team = simulatedTeams[event.kart];
        if (team) {
          processPitlane(simulatedPitlane, event.lane, team);
        }
      } else if (event.type === "add_kart") {
        addKartToPitlane(simulatedPitlane, event.lane, event.kart, event.position);
      } else if (event.type === "remove_kart") {
        removeKartFromPitlane(simulatedPitlane, event.lane, event.kart);
      } else if (event.type === "breakdown") {
        // Поломка не влияет на состояние питлейна, только на команду
        // Никаких изменений питлейна не требуется
      }
    }

    return simulatedPitlane;
  },
}));
