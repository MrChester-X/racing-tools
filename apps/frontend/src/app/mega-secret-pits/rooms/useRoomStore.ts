'use client';
import { create } from 'zustand';
import type { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useRaceStore } from '../store/useRaceStore';
import { RaceData } from '../types';
import { PitRoom, RoomPresenceEntry, RoomPresencePayload } from './types';
import * as api from './roomsClient';

const SESSION_KEY = 'pitSessionId';
const NICKNAME_KEY = 'pitNickname';
const CURRENT_ROOM_KEY = 'pitCurrentRoomId';

function readSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function readNickname(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(NICKNAME_KEY) ?? '';
}

interface RoomStoreState {
  sessionId: string;
  nickname: string;
  currentRoomId: string | null;
  currentRoom: PitRoom | null;
  rooms: PitRoom[];
  isLoading: boolean;
  channel: RealtimeChannel | null;
  /** Everyone connected to the current room right now, one entry per session. */
  presence: RoomPresenceEntry[];
  /** Our own join time, kept stable so re-tracking doesn't reshuffle the list. */
  presenceJoinedAt: number;
  lastSavedAt: number;
  takeoverToast: string | null;
  saveStatus: 'ok' | 'retrying' | 'offline';

  bootstrap: () => Promise<boolean>;
  setNickname: (name: string) => void;
  refreshRooms: () => Promise<void>;
  createRoom: (name: string, useLocalData: boolean, nickname: string) => Promise<string>;
  joinRoom: (id: string) => Promise<void>;
  leaveRoom: () => void;
  takeControl: () => Promise<void>;
  persistData: (raceData: RaceData) => Promise<void>;
  dismissToast: () => void;
}

export const useRoomStore = create<RoomStoreState>((set, get) => ({
  sessionId: '',
  nickname: '',
  currentRoomId: null,
  currentRoom: null,
  rooms: [],
  isLoading: false,
  channel: null,
  presence: [],
  presenceJoinedAt: 0,
  lastSavedAt: 0,
  takeoverToast: null,
  saveStatus: 'ok',

  bootstrap: async () => {
    set({ sessionId: readSessionId(), nickname: readNickname() });
    if (typeof window === 'undefined') return false;
    const storedRoomId = localStorage.getItem(CURRENT_ROOM_KEY);
    if (!storedRoomId) return false;
    try {
      await get().joinRoom(storedRoomId);
      return true;
    } catch {
      localStorage.removeItem(CURRENT_ROOM_KEY);
      return false;
    }
  },

  setNickname: (name: string) => {
    localStorage.setItem(NICKNAME_KEY, name);
    set({ nickname: name });
    // Re-announce so the others see the new name without rejoining.
    const { channel, currentRoomId, sessionId, presenceJoinedAt } = get();
    if (channel && currentRoomId) {
      void channel.track({ sessionId, nickname: name, joinedAt: presenceJoinedAt });
    }
  },

  refreshRooms: async () => {
    set({ isLoading: true });
    try {
      const rooms = await api.listRooms();
      set({ rooms });
    } finally {
      set({ isLoading: false });
    }
  },

  createRoom: async (name, useLocalData, nickname) => {
    get().setNickname(nickname);
    const sessionId = get().sessionId;
    const raceData = useLocalData ? useRaceStore.getState().raceData ?? {} : {};
    const room = await api.createRoom({
      name,
      ownerSessionId: sessionId,
      ownerNickname: nickname,
      data: raceData,
    });
    await get().joinRoom(room.id);
    return room.id;
  },

  joinRoom: async (id) => {
    const room = await api.loadRoom(id);
    if (!room) throw new Error('Room not found');

    useRaceStore.getState().setRaceData(room.data as RaceData);

    const { channel: prev } = get();
    if (prev) await supabase.removeChannel(prev);

    const sessionId = get().sessionId;
    const joinedAt = Date.now();

    const channel = supabase
      .channel(`pit_rooms:${id}:${Date.now()}`, {
        config: { presence: { key: sessionId } },
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pit_rooms', filter: `id=eq.${id}` },
        (payload) => handleRealtime(payload.new as PitRoom, get, set),
      )
      .on('presence', { event: 'sync' }, () => {
        set({ presence: collectPresence(channel.presenceState<RoomPresencePayload>()) });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const fresh = await api.loadRoom(id);
          if (fresh) handleRealtime(fresh, get, set);
          await channel.track({ sessionId, nickname: get().nickname, joinedAt });
        }
      });

    set({ currentRoomId: id, currentRoom: room, channel, presence: [], presenceJoinedAt: joinedAt });
    if (typeof window !== 'undefined') {
      localStorage.setItem(CURRENT_ROOM_KEY, id);
    }
  },

  leaveRoom: () => {
    const { channel } = get();
    if (channel) void supabase.removeChannel(channel);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CURRENT_ROOM_KEY);
    }
    set({
      currentRoomId: null,
      currentRoom: null,
      channel: null,
      presence: [],
      presenceJoinedAt: 0,
      saveStatus: 'ok',
    });
    useRaceStore.getState().loadInitialData();
  },

  takeControl: async () => {
    const { sessionId, nickname, currentRoomId } = get();
    if (!currentRoomId || !nickname) return;
    set({ lastSavedAt: Date.now() });
    await api.claimOwnership(currentRoomId, sessionId, nickname);
  },

  persistData: async (raceData) => {
    const { currentRoomId, currentRoom, sessionId } = get();
    if (!currentRoomId) return;
    if (currentRoom?.ownerSessionId !== sessionId) return;
    set({ lastSavedAt: Date.now() });
    try {
      await api.persistRoomData(currentRoomId, raceData);
      if (get().saveStatus !== 'ok') set({ saveStatus: 'ok' });
    } catch {
      set({ saveStatus: 'retrying' });
      await new Promise((r) => setTimeout(r, 500));
      try {
        set({ lastSavedAt: Date.now() });
        await api.persistRoomData(currentRoomId, raceData);
        set({ saveStatus: 'ok' });
      } catch {
        set({ saveStatus: 'offline' });
      }
    }
  },

  dismissToast: () => set({ takeoverToast: null }),
}));

/**
 * Presence is keyed by sessionId, so one person with several tabs open shows up
 * once — we keep their earliest join so the list order stays put.
 */
function collectPresence(
  state: RealtimePresenceState<RoomPresencePayload>,
): RoomPresenceEntry[] {
  const out: RoomPresenceEntry[] = [];
  for (const [key, entries] of Object.entries(state)) {
    if (!entries.length) continue;
    const earliest = entries.reduce((a, b) => ((b.joinedAt ?? 0) < (a.joinedAt ?? 0) ? b : a));
    out.push({
      sessionId: earliest.sessionId || key,
      nickname: earliest.nickname ?? '',
      joinedAt: earliest.joinedAt ?? 0,
    });
  }
  return out;
}

function handleRealtime(
  next: PitRoom,
  get: () => RoomStoreState,
  set: (partial: Partial<RoomStoreState>) => void,
) {
  const state = get();
  const prevOwnerSessionId = state.currentRoom?.ownerSessionId ?? null;
  set({ currentRoom: next });

  const selfEcho =
    next.ownerSessionId === state.sessionId &&
    Math.abs(new Date(next.updatedAt).getTime() - state.lastSavedAt) < 200;

  const hasData = next.data && typeof next.data === 'object';
  if (!selfEcho && hasData) {
    useRaceStore.getState().setRaceData(next.data as RaceData);
  }

  const lostOwnership =
    prevOwnerSessionId === state.sessionId &&
    next.ownerSessionId !== null &&
    next.ownerSessionId !== state.sessionId;
  if (lostOwnership) {
    set({ takeoverToast: `${next.ownerNickname ?? 'Someone'} took control` });
  }
}
