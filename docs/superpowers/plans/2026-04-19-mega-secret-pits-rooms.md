# Mega-secret-pits Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Supabase-backed "rooms" to `/mega-secret-pits` — one owner per room edits, everyone else views live, any viewer can take control. Room state is overwritten on every action (no history). No backend code.

**Architecture:** Frontend-only. A new `pit_rooms` table holds the latest `RaceData` as jsonb plus `ownerSessionId`/`ownerNickname`. A new `useRoomStore` owns sessionId/nickname/currentRoomId/realtime channel. `useRaceStore.saveRaceData` becomes source-aware (localStorage when no room, UPDATE pit_rooms when in a room). Mutation actions in `useRaceStore` short-circuit when the client is a viewer.

**Tech Stack:** Next.js 15, zustand, `@supabase/supabase-js` Realtime (already installed), TypeORM migrations in `timing-parser` (no entity — pure SQL).

**Spec:** `docs/superpowers/specs/2026-04-19-mega-secret-pits-rooms-design.md`

**Testing note:** No test framework in `race-time-front` or `timing-parser`. Verification is `npx tsc --noEmit` + manual Supabase SQL checks + multi-browser smoke test.

**Git note:** This monorepo is not a git repository. Skip all `git add` / `git commit` steps. If `git init` is done later, commit then.

---

## Deviation from spec — viewer-mode enforcement

The spec section 6.8 asked for per-component `disabled` props. This plan implements that intent more efficiently: **all mutation actions in `useRaceStore` early-return when the client is a viewer**, and the `<main>` content gets `opacity-70 select-none` plus a root-level "click → toast" handler for clear feedback. Result: viewers see the same data that the owner sees (via Realtime), visually muted, and any click on a mutating control does nothing with a toast explaining "Take control first". Header buttons that mutate (Clear, Load test, Settings, Import) keep their individual `disabled` props. This requires **zero edits to `PitsSection` / `TeamsList` / `EventsSection` / `TeamRow` / `KartModal` / `RaceTimer`** — all guarding happens at the store boundary. Implementer: if per-button visual disabling later feels necessary, it's an additive change.

---

## File Structure

New:
- `timing-parser/src/migrations/1776629602751-PitRooms.ts`
- `race-time-front/src/app/mega-secret-pits/rooms/types.ts`
- `race-time-front/src/app/mega-secret-pits/rooms/roomsClient.ts`
- `race-time-front/src/app/mega-secret-pits/rooms/useRoomStore.ts`
- `race-time-front/src/app/mega-secret-pits/rooms/NicknameModal.tsx`
- `race-time-front/src/app/mega-secret-pits/rooms/RoomsModal.tsx`
- `race-time-front/src/app/mega-secret-pits/rooms/RoomBanner.tsx`
- `race-time-front/src/app/mega-secret-pits/rooms/Toast.tsx`

Modified:
- `race-time-front/src/app/mega-secret-pits/store/useRaceStore.ts` — source-aware save + viewer guards on every mutation action
- `race-time-front/src/app/mega-secret-pits/page.tsx` — wire Rooms button, banner, toast, viewer opacity wrapper; guard header mutating buttons

---

## Task 1: Migration for pit_rooms

**Files:**
- Create: `timing-parser/src/migrations/1776629602751-PitRooms.ts`

- [ ] **Step 1: Write the migration**

Create the file:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class PitRooms1776629602751 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table "pit_rooms" (
        id uuid primary key default gen_random_uuid(),
        name varchar not null,
        "ownerSessionId" varchar null,
        "ownerNickname" varchar null,
        data jsonb not null default '{}'::jsonb,
        "createdAt" timestamptz not null default now(),
        "updatedAt" timestamptz not null default now()
      )
    `);

    await queryRunner.query(`alter table "pit_rooms" enable row level security`);
    await queryRunner.query(`
      create policy "pit_rooms public rw" on "pit_rooms"
      for all to anon
      using (true)
      with check (true)
    `);

    await queryRunner.query(`alter publication supabase_realtime add table "pit_rooms"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter publication supabase_realtime drop table "pit_rooms"`);
    await queryRunner.query(`drop policy if exists "pit_rooms public rw" on "pit_rooms"`);
    await queryRunner.query(`drop table if exists "pit_rooms"`);
  }
}
```

- [ ] **Step 2: Typecheck timing-parser**

Run in `timing-parser/`:
```
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: User will apply later**

User runs `npm run migration:run` in `timing-parser/` when they pick up the change. No server side code — just the table + RLS + realtime publication.

---

## Task 2: Types

**Files:**
- Create: `race-time-front/src/app/mega-secret-pits/rooms/types.ts`

- [ ] **Step 1: Write types**

```typescript
export interface PitRoom {
  id: string;
  name: string;
  ownerSessionId: string | null;
  ownerNickname: string | null;
  data: unknown; // RaceData, but kept loose at the rooms layer
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Typecheck**

Run in `race-time-front/`:
```
npx tsc --noEmit
```
Expected: no output.

---

## Task 3: Supabase client functions

**Files:**
- Create: `race-time-front/src/app/mega-secret-pits/rooms/roomsClient.ts`

- [ ] **Step 1: Write client**

```typescript
import { supabase } from '@/lib/supabase';
import { PitRoom } from './types';

export async function listRooms(): Promise<PitRoom[]> {
  const { data, error } = await supabase
    .from('pit_rooms')
    .select('*')
    .order('updatedAt', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as PitRoom[];
}

export async function loadRoom(id: string): Promise<PitRoom | null> {
  const { data, error } = await supabase
    .from('pit_rooms')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as PitRoom | null) ?? null;
}

export async function createRoom(params: {
  name: string;
  ownerSessionId: string;
  ownerNickname: string;
  data: unknown;
}): Promise<PitRoom> {
  const { data, error } = await supabase
    .from('pit_rooms')
    .insert({
      name: params.name,
      ownerSessionId: params.ownerSessionId,
      ownerNickname: params.ownerNickname,
      data: params.data,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as PitRoom;
}

export async function persistRoomData(id: string, data: unknown): Promise<void> {
  const { error } = await supabase
    .from('pit_rooms')
    .update({ data, updatedAt: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function claimOwnership(id: string, sessionId: string, nickname: string): Promise<void> {
  const { error } = await supabase
    .from('pit_rooms')
    .update({
      ownerSessionId: sessionId,
      ownerNickname: nickname,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 2: Typecheck**

Run in `race-time-front/`:
```
npx tsc --noEmit
```
Expected: no output.

---

## Task 4: Room store

**Files:**
- Create: `race-time-front/src/app/mega-secret-pits/rooms/useRoomStore.ts`

- [ ] **Step 1: Write store**

```typescript
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

function readSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
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

  bootstrap: () => void;
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

  bootstrap: () => {
    set({ sessionId: readSessionId(), nickname: readNickname() });
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
    if (prev) supabase.removeChannel(prev);

    const channel = supabase
      .channel(`pit_rooms:${id}`)
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
  },

  leaveRoom: () => {
    const { channel } = get();
    if (channel) supabase.removeChannel(channel);
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

  if (!selfEcho) {
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
```

- [ ] **Step 2: Typecheck**

Run in `race-time-front/`:
```
npx tsc --noEmit
```
Expected: no output.

---

## Task 5: NicknameModal

**Files:**
- Create: `race-time-front/src/app/mega-secret-pits/rooms/NicknameModal.tsx`

- [ ] **Step 1: Write modal**

```tsx
'use client';
import { useState } from 'react';

interface Props {
  open: boolean;
  initial: string;
  onSubmit: (nickname: string) => void;
  onCancel: () => void;
  title?: string;
}

export function NicknameModal({ open, initial, onSubmit, onCancel, title }: Props) {
  const [value, setValue] = useState(initial);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = value.trim();
          if (trimmed) onSubmit(trimmed);
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-[360px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#0a0a0f] p-6 space-y-4"
      >
        <h3 className="text-white text-sm font-bold uppercase tracking-wide">
          {title ?? 'Your nickname'}
        </h3>
        <input
          autoFocus
          type="text"
          required
          maxLength={40}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Nikita"
          className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/40"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 text-xs font-medium hover:text-white hover:bg-white/[0.04]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="px-4 py-1.5 rounded-lg bg-orange-500 text-black text-xs font-bold uppercase tracking-wider hover:bg-orange-400 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run in `race-time-front/`:
```
npx tsc --noEmit
```
Expected: no output.

---

## Task 6: RoomsModal

**Files:**
- Create: `race-time-front/src/app/mega-secret-pits/rooms/RoomsModal.tsx`

- [ ] **Step 1: Write modal**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRoomStore } from './useRoomStore';
import { NicknameModal } from './NicknameModal';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = 'browse' | 'create';

export function RoomsModal({ open, onClose }: Props) {
  const { rooms, isLoading, nickname, sessionId, refreshRooms, createRoom, joinRoom, setNickname } = useRoomStore();
  const [tab, setTab] = useState<Tab>('browse');
  const [name, setName] = useState('');
  const [nick, setNick] = useState(nickname);
  const [useLocal, setUseLocal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingJoinId, setPendingJoinId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTab('browse');
      setError(null);
      setNick(nickname);
      refreshRooms().catch((e) => setError((e as Error).message));
    }
  }, [open, nickname, refreshRooms]);

  if (!open) return null;

  const doCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await createRoom(name.trim(), useLocal, nick.trim());
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const runJoin = async (id: string) => {
    setError(null);
    setBusy(true);
    try {
      await joinRoom(id);
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Join failed');
    } finally {
      setBusy(false);
    }
  };

  const doJoin = (id: string) => {
    if (!nickname) {
      setPendingJoinId(id);
      return;
    }
    void runJoin(id);
  };

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-[94vw] rounded-2xl border border-white/10 bg-[#0a0a0f] p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-white text-sm font-bold uppercase tracking-wide">Rooms</h3>
          <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06]">
            <button
              onClick={() => setTab('browse')}
              className={`px-3 py-1 rounded-md text-[11px] font-medium ${
                tab === 'browse' ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Browse
            </button>
            <button
              onClick={() => setTab('create')}
              className={`px-3 py-1 rounded-md text-[11px] font-medium ${
                tab === 'create' ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Create
            </button>
          </div>
        </div>

        {error && <div className="text-red-400 text-xs">{error}</div>}

        {tab === 'browse' && (
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {isLoading && <div className="text-gray-500 text-xs">Loading…</div>}
            {!isLoading && rooms.length === 0 && (
              <div className="text-gray-600 text-xs uppercase tracking-[3px] text-center py-8">
                No rooms yet
              </div>
            )}
            {rooms.map((r) => {
              const ownerLabel =
                r.ownerSessionId === sessionId
                  ? 'You'
                  : r.ownerNickname ?? (r.ownerSessionId ? 'Unknown' : '—');
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 border border-white/10 rounded-lg px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium truncate">{r.name}</div>
                    <div className="text-gray-600 text-[11px] font-mono">
                      Owner: {ownerLabel} · updated {new Date(r.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => doJoin(r.id)}
                    disabled={busy}
                    className="px-3 py-1 rounded-md bg-orange-500/80 text-black text-[11px] font-bold uppercase tracking-wider hover:bg-orange-400 disabled:opacity-50"
                  >
                    Join
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'create' && (
          <form onSubmit={doCreate} className="space-y-3">

            <div className="space-y-1">
              <label className="text-gray-500 text-[10px] uppercase tracking-wider">Room name</label>
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-gray-500 text-[10px] uppercase tracking-wider">Your nickname</label>
              <input
                required
                maxLength={40}
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-gray-300 text-xs cursor-pointer">
              <input type="checkbox" checked={useLocal} onChange={(e) => setUseLocal(e.target.checked)} />
              Start with my current local data
            </label>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 text-xs font-medium hover:text-white hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !name.trim() || !nick.trim()}
                className="px-4 py-1.5 rounded-lg bg-orange-500 text-black text-xs font-bold uppercase tracking-wider hover:bg-orange-400 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
    <NicknameModal
      open={pendingJoinId !== null}
      initial={nickname}
      onCancel={() => setPendingJoinId(null)}
      onSubmit={(n) => {
        setNickname(n);
        const id = pendingJoinId;
        setPendingJoinId(null);
        if (id) void runJoin(id);
      }}
      title="Set nickname to join"
    />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run in `race-time-front/`:
```
npx tsc --noEmit
```
Expected: no output.

---

## Task 7: RoomBanner

**Files:**
- Create: `race-time-front/src/app/mega-secret-pits/rooms/RoomBanner.tsx`

- [ ] **Step 1: Write banner**

```tsx
'use client';
import { useState } from 'react';
import { useRoomStore } from './useRoomStore';
import { NicknameModal } from './NicknameModal';

export function RoomBanner() {
  const {
    currentRoomId,
    currentRoom,
    sessionId,
    nickname,
    saveStatus,
    takeControl,
    leaveRoom,
    setNickname,
  } = useRoomStore();
  const [nickModalOpen, setNickModalOpen] = useState(false);

  if (!currentRoomId || !currentRoom) return null;

  const isOwner = currentRoom.ownerSessionId === sessionId;
  const ownerLabel = currentRoom.ownerSessionId
    ? currentRoom.ownerNickname ?? 'Unknown'
    : 'No active owner';

  const onTake = async () => {
    if (!nickname) {
      setNickModalOpen(true);
      return;
    }
    await takeControl();
  };

  return (
    <>
      <div className="relative z-20 bg-gradient-to-r from-orange-950/50 to-amber-950/50 border-b border-orange-500/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-3 text-xs">
          <span className="text-orange-200 font-bold uppercase tracking-wider">
            Room: {currentRoom.name}
          </span>
          <span className="text-gray-400">·</span>
          {isOwner ? (
            <span className="text-green-300">You&apos;re editing (as {nickname || '—'})</span>
          ) : (
            <span className="text-gray-300">
              Viewing · Owner: <span className="text-orange-200">{ownerLabel}</span>
            </span>
          )}
          {saveStatus === 'retrying' && (
            <span className="text-yellow-400">· Saving…</span>
          )}
          {saveStatus === 'offline' && (
            <span className="text-red-400">· Offline — changes not synced</span>
          )}
          <div className="flex-1" />
          {!isOwner && (
            <button
              onClick={onTake}
              className="px-2 py-0.5 rounded border border-orange-400/40 text-orange-200 text-[11px] font-medium hover:bg-orange-500/20"
            >
              Take control
            </button>
          )}
          <button
            onClick={leaveRoom}
            className="px-2 py-0.5 rounded border border-white/10 text-gray-300 text-[11px] font-medium hover:bg-white/[0.04]"
          >
            Leave
          </button>
        </div>
      </div>
      <NicknameModal
        open={nickModalOpen}
        initial={nickname}
        onCancel={() => setNickModalOpen(false)}
        onSubmit={async (n) => {
          setNickname(n);
          setNickModalOpen(false);
          await takeControl();
        }}
        title="Set nickname to take control"
      />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run in `race-time-front/`:
```
npx tsc --noEmit
```
Expected: no output.

---

## Task 8: Toast

**Files:**
- Create: `race-time-front/src/app/mega-secret-pits/rooms/Toast.tsx`

- [ ] **Step 1: Write toast**

```tsx
'use client';
import { useEffect } from 'react';
import { useRoomStore } from './useRoomStore';

export function RoomToast() {
  const { takeoverToast, dismissToast } = useRoomStore();

  useEffect(() => {
    if (!takeoverToast) return;
    const timer = setTimeout(dismissToast, 4000);
    return () => clearTimeout(timer);
  }, [takeoverToast, dismissToast]);

  if (!takeoverToast) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[70] bg-orange-500 text-black rounded-lg px-4 py-2 text-sm font-medium shadow-lg">
      {takeoverToast}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run in `race-time-front/`:
```
npx tsc --noEmit
```
Expected: no output.

---

## Task 9: Patch useRaceStore — source-aware save + viewer guards

**Files:**
- Modify: `race-time-front/src/app/mega-secret-pits/store/useRaceStore.ts`

- [ ] **Step 1: Add imports and helper at top**

At the top of the file, add:

```typescript
import { useRoomStore } from "@/app/mega-secret-pits/rooms/useRoomStore";
```

Then, inside the zustand `create(...)` factory scope but outside the object literal, we'll use the pattern: since zustand `create` gives us `(set, get) => (...)`, we add a small helper below the existing helper functions (after `replaceKartInPitlane`). Paste this:

```typescript
function isViewerLocked(): boolean {
  if (typeof window === 'undefined') return false;
  const { currentRoomId, currentRoom, sessionId } = useRoomStore.getState();
  return !!currentRoomId && currentRoom?.ownerSessionId !== sessionId;
}
```

- [ ] **Step 2: Replace `saveRaceData` implementation**

Find the current `saveRaceData` action (currently writes localStorage) and replace it with:

```typescript
saveRaceData: () => {
  const { raceData } = get();
  if (!raceData) return;
  if (typeof window === 'undefined') return;

  const room = useRoomStore.getState();
  if (room.currentRoomId) {
    if (room.currentRoom?.ownerSessionId !== room.sessionId) return;
    void room.persistData(raceData);
  } else {
    localStorage.setItem("raceData", JSON.stringify(raceData));
  }
},
```

- [ ] **Step 3: Add viewer guard to every mutation action**

Add this one-liner as the **first** statement inside each of these actions:
`setKartColors`, `setKartComments`, `addTeam`, `deleteTeam`, `addEvent`, `deleteEvent`, `undoLastAction`, `clearRaceData`, `loadTestData`, `updateRaceSettings`, `startRace`, `stopRace`, `resetRaceTimer`.

```typescript
if (isViewerLocked()) return false as any;
```

Notes:
- For actions that return `boolean` (`addTeam`, `addEvent`, `undoLastAction`), the `return false as any` is accepted by TypeScript because the existing signatures already return `boolean`. Short-circuit returns `false` → UI code that checked the return value treats it as "nothing changed".
- For void-returning actions (`setKartColors`, `setKartComments`, `deleteTeam`, `deleteEvent`, `clearRaceData`, `loadTestData`, `updateRaceSettings`, `startRace`, `stopRace`, `resetRaceTimer`), `return;` would be cleaner. Simplify per-action:

For void-returning actions, use:
```typescript
if (isViewerLocked()) return;
```

For boolean-returning actions, use:
```typescript
if (isViewerLocked()) return false;
```

- [ ] **Step 4: Typecheck**

Run in `race-time-front/`:
```
npx tsc --noEmit
```
Expected: no output.

---

## Task 10: Wire page.tsx — Rooms button, banner, toast, viewer opacity, header-button guards

**Files:**
- Modify: `race-time-front/src/app/mega-secret-pits/page.tsx`

- [ ] **Step 1: Read current file**

`Read` the current page.tsx in full before editing — it has ~280 lines.

- [ ] **Step 2: Add imports**

Add near existing imports:

```tsx
import { useRoomStore } from "./rooms/useRoomStore";
import { RoomsModal } from "./rooms/RoomsModal";
import { RoomBanner } from "./rooms/RoomBanner";
import { RoomToast } from "./rooms/Toast";
```

- [ ] **Step 3: Pull room state inside component**

At the top of `export default function Pits()`, next to the existing `useRaceStore` destructure and `useState` calls, add:

```tsx
const { bootstrap, currentRoomId, currentRoom, sessionId } = useRoomStore();
const [isRoomsModalOpen, setIsRoomsModalOpen] = useState(false);
const isViewer = !!currentRoomId && currentRoom?.ownerSessionId !== sessionId;
```

- [ ] **Step 4: Bootstrap room store on mount**

Replace the existing `useEffect`:

```tsx
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);
```

with:

```tsx
  useEffect(() => {
    bootstrap();
    loadInitialData();
  }, [bootstrap, loadInitialData]);
```

- [ ] **Step 5: Insert the Rooms button in the header action row**

In the action-buttons row (the `<div className="flex flex-wrap items-center gap-2 sm:gap-3">` block), insert as the **first** child, before the existing Import button:

```tsx
              <button
                onClick={() => setIsRoomsModalOpen(true)}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors duration-200 text-xs"
                title="Rooms"
              >
                <span>🏠</span>
                <span className="hidden sm:inline">Rooms</span>
              </button>
```

- [ ] **Step 6: Disable mutating header buttons in viewer mode**

On each of these four buttons add `disabled={isViewer}`:
- Import (`onClick={() => setIsImportModalOpen(true)}`)
- Settings (`onClick={() => setIsSettingsModalOpen(true)}`)
- Тест / LoadTestData (`onClick={() => setIsLoadTestModalOpen(true)}`)
- Очистить / Clear (`onClick={() => setIsClearModalOpen(true)}`)

Also append to their `className`: `disabled:opacity-50 disabled:cursor-not-allowed`.

Example for the Import button (full replacement):

```tsx
              <button
                onClick={() => setIsImportModalOpen(true)}
                disabled={isViewer}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors duration-200 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                title="Импорт команд из текста"
              >
                ...
              </button>
```

Repeat for Settings, Тест, Очистить. PDF, РЕЖИМ ВОЛНЫ, МОБИЛЬНЫЙ, LIVE buttons are read-only navigations — leave them alone.

- [ ] **Step 7: Wrap `<main>` to show viewer-mode visual**

Replace the `<main>` element opening tag with:

```tsx
      <main className={`relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8 transition-opacity ${isViewer ? 'opacity-70 select-none' : ''}`}>
```

- [ ] **Step 8: Mount RoomBanner / RoomsModal / RoomToast**

Insert `<RoomBanner />` as the **first** child of the root `<div className="min-h-screen relative">` (before `<header>`):

```tsx
    <div className="min-h-screen relative">
      <RoomBanner />
      <header className="relative z-10 bg-black/20 backdrop-blur-sm border-b border-white/10">
        ...
```

At the end (inside the root div, alongside existing modals), add:

```tsx
        <RoomsModal isOpen={isRoomsModalOpen} onClose={() => setIsRoomsModalOpen(false)} />
        <RoomToast />
```

Wait — `RoomsModal` in Task 6 uses prop names `open` / `onClose`, not `isOpen`. Fix the render call to match:

```tsx
        <RoomsModal open={isRoomsModalOpen} onClose={() => setIsRoomsModalOpen(false)} />
        <RoomToast />
```

- [ ] **Step 9: Typecheck**

Run in `race-time-front/`:
```
npx tsc --noEmit
```
Expected: no output.

---

## Task 11: Smoke test (manual)

- [ ] **Step 1: Apply the migration on Supabase**

Run in `timing-parser/`:
```
npm run migration:run
```
Verify in Supabase SQL editor:
```sql
select * from pit_rooms;
```
Expected: empty table, but query succeeds.

- [ ] **Step 2: Start the frontend**

Run in `race-time-front/`:
```
npm run dev
```

- [ ] **Step 3: Local mode still works**

Open `http://localhost:3000/mega-secret-pits` in a normal browser window.

Verify:
- Page loads. `localStorage.raceData` populated if this is an existing user, otherwise TestRaceData renders.
- A new `localStorage.pitSessionId` (UUID) is set.
- All existing controls work (add team, add event, kart colors).
- **🏠 Rooms** button is visible in the header.

- [ ] **Step 4: Create a room**

Click 🏠 Rooms → Create tab → fill `Room name` = "Smoke", `Your nickname` = "A". Check "Start with my current local data". Click Create.

Expected:
- Modal closes. `RoomBanner` appears: "Room: Smoke · You're editing (as A) · [Leave]".
- `select * from pit_rooms` shows 1 row with correct name/owner.

- [ ] **Step 5: Owner mutations persist**

Add a team (name "Test", start kart "77"). Observe Supabase:
```sql
select data->'teams' from pit_rooms;
```
Expected: returns `[{"name":"Test","startKart":"77"}, ...]`.

- [ ] **Step 6: Viewer mode**

Open the same URL in a different browser (Firefox if dev is Chrome) or an incognito window → different `pitSessionId`. Click 🏠 Rooms → Join "Smoke".

Expected:
- Banner: "Room: Smoke · Viewing · Owner: A · [Take control] [Leave]".
- Main content visually dimmed (`opacity-70`).
- Header mutating buttons disabled.
- Click "Add team" (in the dimmed content) → nothing happens (action short-circuits).

- [ ] **Step 7: Realtime propagation**

From the **owner** window, add another team. Within ~500 ms, the viewer window shows the new team in TeamsList without refresh.

- [ ] **Step 8: Takeover**

In the **viewer** window, click "Take control". A nickname modal appears. Enter "B" → Save.

Expected:
- Viewer window: banner flips to "You're editing (as B)", `opacity-70` gone, header buttons re-enabled.
- Owner window (A): toast "B took control" appears bottom-right. Banner flips to "Viewing · Owner: B". Their buttons become disabled.

- [ ] **Step 9: Leave**

Click "Leave" in both windows. Banner disappears. `localStorage.raceData` loads — returns to local mode.

- [ ] **Step 10: Rooms list updates**

Re-open the Rooms modal. "Smoke" row visible with `updated X ago`, `Owner: B`. `[Join]` works and rehydrates the state.

If any step fails — re-open the relevant earlier task and fix. No commit step (project is not a git repo).
