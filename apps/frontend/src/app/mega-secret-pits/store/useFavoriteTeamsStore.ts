import { create } from "zustand";

// Favorite teams are a per-device UI preference (which teams to highlight on the
// track map), not shared race data — so they live in localStorage, like the
// pitlane display prefs.
interface FavoriteTeamsStore {
  // start-kart → true for favorited teams.
  favorites: Record<string, boolean>;
  isFavorite: (startKart: string) => boolean;
  toggle: (startKart: string) => void;
  hydrate: () => void;
}

const STORAGE_KEY = "favoriteTeams";

function persist(favorites: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.keys(favorites)));
  } catch {}
}

export const useFavoriteTeamsStore = create<FavoriteTeamsStore>((set, get) => ({
  favorites: {},
  isFavorite: (startKart) => !!get().favorites[startKart],
  toggle: (startKart) => {
    const next = { ...get().favorites };
    if (next[startKart]) delete next[startKart];
    else next[startKart] = true;
    set({ favorites: next });
    persist(next);
  },
  hydrate: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const favorites: Record<string, boolean> = {};
      for (const k of parsed) if (typeof k === "string") favorites[k] = true;
      set({ favorites });
    } catch {}
  },
}));
