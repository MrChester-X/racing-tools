import { create } from "zustand";

export type PitlaneExitDirection = "left" | "right";
export type PitlaneOrder = "top-down" | "bottom-up";

interface PitlaneDisplayStore {
  exitDirection: PitlaneExitDirection;
  order: PitlaneOrder;
  setExitDirection: (value: PitlaneExitDirection) => void;
  setOrder: (value: PitlaneOrder) => void;
  hydrate: () => void;
}

const STORAGE_KEY = "pitlaneDisplayPrefs";

function persist(state: { exitDirection: PitlaneExitDirection; order: PitlaneOrder }) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export const usePitlaneDisplayStore = create<PitlaneDisplayStore>((set, get) => ({
  exitDirection: "left",
  order: "top-down",
  setExitDirection: (value) => {
    set({ exitDirection: value });
    persist({ exitDirection: value, order: get().order });
  },
  setOrder: (value) => {
    set({ order: value });
    persist({ exitDirection: get().exitDirection, order: value });
  },
  hydrate: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        exitDirection: PitlaneExitDirection;
        order: PitlaneOrder;
      }>;
      const next: Partial<PitlaneDisplayStore> = {};
      if (parsed.exitDirection === "left" || parsed.exitDirection === "right") {
        next.exitDirection = parsed.exitDirection;
      }
      if (parsed.order === "top-down" || parsed.order === "bottom-up") {
        next.order = parsed.order;
      }
      if (Object.keys(next).length) set(next);
    } catch {}
  },
}));
