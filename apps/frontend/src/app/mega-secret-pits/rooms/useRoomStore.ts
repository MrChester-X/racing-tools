'use client';
import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useRaceStore } from '../store/useRaceStore';
import { RaceData } from '../types';
import { PitRoom } from './types';
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

    const channel = supabase
      .channel(`pit_rooms:${id}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pit_rooms', filter: `id=eq.${id}` },
        (payload) => handleRealtime(payload.new as PitRoom, get, set),
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const fresh = await api.loadRoom(id);
          if (fresh) handleRealtime(fresh, get, set);
        }
      });

    set({ currentRoomId: id, currentRoom: room, channel });
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
    set({ currentRoomId: null, currentRoom: null, channel: null, saveStatus: 'ok' });
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
