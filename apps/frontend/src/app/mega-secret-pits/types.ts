export interface RaceEvent {
  type: "pit" | "add_kart" | "remove_kart" | "breakdown";
  kart: string;
  lane: number;
  timestamp?: number;
  position?: number; // Для add_kart: позиция в питлейне (0 = в начало, -1 = в конец)
  newKart?: string; // Для breakdown: новый карт на замену
  replacedKart?: string; // Для breakdown: замененный карт (для истории)
  lapNumber?: number; // Для pit: номер круга в привязанной гонке
}

export interface ParsedRaceEvent {
  type: "pit" | "add_kart" | "remove_kart" | "breakdown";
  pitCount?: number; // Только для типа "pit"
  kart: string;
  lane: number;
  team?: ParsedRaceTeam; // Для типов "add_kart", "remove_kart", "breakdown" может не быть команды
  timestamp?: number;
  position?: number; // Для add_kart: позиция в питлейне (0 = в начало, -1 = в конец)
  newKart?: string; // Для breakdown: новый карт на замену
  replacedKart?: string; // Для breakdown: замененный карт (для истории)
  lapNumber?: number; // Для pit: номер круга в привязанной гонке
}

export interface RaceTeam {
  name: string;
  startKart: string;
}

export interface ParsedRaceTeam {
  name: string;
  startKart: string;
  karts: string[];
}

export interface RaceSettings {
  raceName?: string; // Название заезда (опционально)
  pitlanesCount: number; // Количество питлейнов
  startPitlane: string[][]; // Стартовые карты в питлейнах
  raceComments?: string; // Комментарии по гонке
  maxLapTimeForAverageSec?: number; // Максимальное время круга в секундах, выше которого круги не учитываются в среднем
  minLapTimeSec?: number; // Минимальное время круга в секундах; круги меньше не учитываются ни в одной статистике (best/avg/...)
}

export interface RaceTimer {
  startTime: number | null;
  endTime: number | null;
  isRunning: boolean;
}

export interface RaceData {
  events: RaceEvent[];
  teams: RaceTeam[];
  pitlanesCount: number;
  startPitlane: string[][];
  kartColors?: { [kart: string]: number };
  kartComments?: { [kart: string]: string };
  settings?: RaceSettings;
  timer?: RaceTimer;
  linkedHeatId?: string | null;
}
