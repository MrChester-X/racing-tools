import { create } from "zustand";

export interface LapRecord {
  lap: number;
  time: number;       // lap time in ms
  timestamp: number;  // Date.now() when received
  position: number;
  bestLap: number;
  avgLap: number;
}

export interface KartData {
  kart: string;
  name: string;
  laps: LapRecord[];
}

export interface SessionData {
  name: string;
  karts: Record<string, KartData>;   // by kart number
  lastUpdate: number;
}

// Current live state per kart (not persisted)
export interface LiveKartState {
  kart: string;
  name: string;
  position: number;
  lapCount: number;
  lastLap: number;
  bestLap: number;
  avgLap: number;
  gap: string;
}

interface LiveTimingStore {
  // Connection
  connected: boolean;
  wsRef: WebSocket | null;
  currentSessionName: string | null;
  liveKarts: LiveKartState[];

  // Persisted sessions
  sessions: Record<string, SessionData>;

  // Selected session for matching
  selectedSessionName: string | null;

  // Actions
  connect: () => void;
  disconnect: () => void;
  selectSession: (name: string | null) => void;
  loadSessions: () => void;
  clearSession: (name: string) => void;

  // Getters
  getKartLiveData: (kartNumber: string) => LiveKartState | null;
  getKartLaps: (kartNumber: string) => LapRecord[];
}

const WS_URL = "wss://webserver8.sms-timing.com:10015/";
const INIT_MSG = "START 25506@pitstoppremium";
const STORAGE_KEY = "sms-timing-sessions";

function loadFromStorage(): Record<string, SessionData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveToStorage(sessions: Record<string, SessionData>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export const useLiveTimingStore = create<LiveTimingStore>((set, get) => ({
  connected: false,
  wsRef: null,
  currentSessionName: null,
  liveKarts: [],
  sessions: {},
  selectedSessionName: null,

  loadSessions: () => {
    set({ sessions: loadFromStorage() });
  },

  connect: () => {
    const { wsRef } = get();
    if (wsRef) wsRef.close();

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      set({ connected: true, wsRef: ws });
      ws.send(INIT_MSG);
    };

    ws.onmessage = (event) => {
      const raw = event.data as string;
      if (!raw.startsWith("{")) return;

      try {
        const msg = JSON.parse(raw);
        if (!msg.D || !Array.isArray(msg.D)) return;

        const sessionName = msg.N || "Unknown";
        const now = Date.now();

        // Update live state
        const liveKarts: LiveKartState[] = msg.D
          .sort((a: { P: number }, b: { P: number }) => a.P - b.P)
          .map((d: { K: string; N: string; P: number; L: number; T: number; B: number; A: number; G: string }) => ({
            kart: d.K,
            name: d.N,
            position: d.P,
            lapCount: d.L,
            lastLap: d.T,
            bestLap: d.B,
            avgLap: d.A,
            gap: d.G,
          }));

        set({ liveKarts, currentSessionName: sessionName });

        // Persist laps to localStorage
        const sessions = { ...get().sessions };
        if (!sessions[sessionName]) {
          sessions[sessionName] = { name: sessionName, karts: {}, lastUpdate: now };
        }
        const session = sessions[sessionName];

        for (const d of msg.D) {
          const kartKey = d.K as string;
          if (!session.karts[kartKey]) {
            session.karts[kartKey] = { kart: kartKey, name: d.N, laps: [] };
          }

          const kartData = session.karts[kartKey];
          kartData.name = d.N; // update name

          const lapNum = d.L as number;
          const lapTime = d.T as number;

          // Only add if this is a new lap we haven't recorded yet
          if (lapNum > 0 && lapTime > 0) {
            const alreadyRecorded = kartData.laps.some((l) => l.lap === lapNum);
            if (!alreadyRecorded) {
              kartData.laps.push({
                lap: lapNum,
                time: lapTime,
                timestamp: now,
                position: d.P,
                bestLap: d.B,
                avgLap: d.A,
              });
              // Sort by lap number
              kartData.laps.sort((a, b) => a.lap - b.lap);
            }
          }
        }

        session.lastUpdate = now;
        sessions[sessionName] = session;
        set({ sessions });
        saveToStorage(sessions);

        // Auto-select session if none selected
        if (!get().selectedSessionName) {
          set({ selectedSessionName: sessionName });
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      set({ connected: false });
    };

    ws.onclose = () => {
      set({ connected: false, wsRef: null });
    };

    set({ wsRef: ws });
  },

  disconnect: () => {
    const { wsRef } = get();
    if (wsRef) wsRef.close();
    set({ connected: false, wsRef: null, liveKarts: [] });
  },

  selectSession: (name) => {
    set({ selectedSessionName: name });
  },

  clearSession: (name) => {
    const sessions = { ...get().sessions };
    delete sessions[name];
    set({ sessions });
    saveToStorage(sessions);
    if (get().selectedSessionName === name) {
      set({ selectedSessionName: null });
    }
  },

  getKartLiveData: (kartNumber) => {
    return get().liveKarts.find((k) => k.kart === kartNumber) || null;
  },

  getKartLaps: (kartNumber) => {
    const { selectedSessionName, sessions } = get();
    if (!selectedSessionName || !sessions[selectedSessionName]) return [];
    return sessions[selectedSessionName].karts[kartNumber]?.laps || [];
  },
}));
