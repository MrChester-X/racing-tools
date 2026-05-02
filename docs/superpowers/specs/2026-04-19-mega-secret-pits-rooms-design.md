# Mega-secret-pits rooms — design

**Date:** 2026-04-19
**Status:** Approved

## 1. Summary

Add optional cloud-backed "rooms" to `/mega-secret-pits` so multiple browsers can collaborate on the same pitlane state in real time. One "owner" per room edits; everyone else views live. Any viewer can take control without authorization. No backend code is added — the frontend talks directly to a new Supabase table and its Realtime publication.

## 2. Key decisions (locked during brainstorming)

| # | Question | Decision |
|---|---|---|
| 1 | Save granularity | Save on every action (matches current `saveRaceData` call pattern in `useRaceStore`) |
| 2 | Schema shape | Single table `pit_rooms`, row is overwritten on every save — no history |
| 3 | Ownership takeover | Soft takeover — any viewer can click "Take control"; previous owner is notified via Realtime |
| 4 | Room entry UX | Modal with Browse + Create sections, triggered by a "Rooms" button on the page; no URL routing |
| 5 | Nickname storage | Only the current owner's nickname is stored on the row (`ownerNickname`); viewer nicknames stay in their own localStorage |

## 3. Data model

### 3.1 Table

```sql
create table pit_rooms (
  id uuid primary key default gen_random_uuid(),
  name varchar not null,
  "ownerSessionId" varchar null,
  "ownerNickname" varchar null,
  data jsonb not null default '{}'::jsonb,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
```

No indexes — expected row count is small (tens to low hundreds).

### 3.2 RLS + Realtime

```sql
alter table pit_rooms enable row level security;

create policy "pit_rooms public rw" on pit_rooms
  for all to anon
  using (true)
  with check (true);

alter publication supabase_realtime add table pit_rooms;
```

Fully public (matching the existing `heats` / `laps` decision — no auth in this project).

### 3.3 Migration

Hand-written TypeORM migration in `timing-parser/src/migrations/<ts>-PitRooms.ts`:

- `up()` runs the three SQL blocks above.
- `down()` drops the publication-membership, drops the policy, drops the table.

No TypeORM entity is created — `pit_rooms` is consumed only by the frontend through `supabase-js`.

### 3.4 Jsonb payload

`pit_rooms.data` stores the existing `RaceData` verbatim (events, teams, pitlanesCount, startPitlane, kartColors, kartComments, settings, timer).

Transient UI state stays client-local and is **not** persisted:
- `useRaceStore.focusKart`
- `useRaceStore.undoHistory`

## 4. Frontend modules

```
race-time-front/src/app/mega-secret-pits/rooms/
├── types.ts              PitRoom interface (matches the DB row)
├── roomsClient.ts        createRoom, listRooms, loadRoom, persistData, claimOwnership
├── useRoomStore.ts       Zustand store (sessionId, nickname, currentRoomId, currentRoom, rooms, channel, lastSavedAt)
├── RoomsModal.tsx        Browse + Create modal
├── RoomBanner.tsx        "Room: X — editing/viewing" banner with action buttons
└── NicknameModal.tsx     Blocking modal used at first Join or Take control
```

Modified:

- `race-time-front/src/app/mega-secret-pits/store/useRaceStore.ts` — `saveRaceData()` becomes source-aware (localStorage vs `pit_rooms.data`).
- `race-time-front/src/app/mega-secret-pits/page.tsx` — mounts `<RoomsModal />` + `<RoomBanner />`, hosts the "Rooms" button.
- All action-surface components (existing ones) — read `useRoomStore.isOwner` and disable their inputs when `currentRoomId !== null && !isOwner`.

No new dependencies. `@supabase/supabase-js` is already installed.

## 5. Store shapes

### 5.1 `useRoomStore`

```ts
interface RoomStoreState {
  sessionId: string;               // localStorage.pitSessionId (crypto.randomUUID() on first load)
  nickname: string;                // localStorage.pitNickname ('' if never set)
  currentRoomId: string | null;
  currentRoom: PitRoom | null;
  rooms: PitRoom[];
  isLoading: boolean;
  channel: RealtimeChannel | null;
  lastSavedAt: number;             // epoch ms; used to suppress self-echo
  takeoverToast: string | null;    // consumed by a top-level toast renderer

  setNickname(name: string): void;
  refreshRooms(): Promise<void>;
  createRoom(name: string, useLocalData: boolean): Promise<string>;
  joinRoom(id: string): Promise<void>;
  leaveRoom(): void;
  takeControl(): Promise<void>;
  persistData(raceData: RaceData): Promise<void>;  // only owner calls this

  get isOwner(): boolean;          // derived; in zustand, implement as selector
}
```

`isOwner` is selected, not stored: `useRoomStore(s => s.currentRoom?.ownerSessionId === s.sessionId)`.

### 5.2 `useRaceStore.saveRaceData` change

```ts
saveRaceData: () => {
  const { raceData } = get();
  if (!raceData) return;

  const room = useRoomStore.getState();
  if (!room.currentRoomId) {
    localStorage.setItem("raceData", JSON.stringify(raceData));
    return;
  }
  // In-room: only the owner persists. Viewer should never reach here because
  // inputs are disabled; but guard defensively.
  if (room.currentRoom?.ownerSessionId !== room.sessionId) return;
  void room.persistData(raceData);
}
```

No other code in `useRaceStore` changes — 20+ callers that already call `saveRaceData()` continue to work.

## 6. Flows

### 6.1 Initial page load

1. Mount `/mega-secret-pits`.
2. `useRoomStore` constructor: reads `localStorage.pitSessionId` (generates and saves on miss), reads `localStorage.pitNickname`.
3. `useRaceStore.loadInitialData()` — unchanged, reads `localStorage.raceData`.
4. User works in **local mode**. The "Rooms" button is visible but no banner.

### 6.2 Create room

1. Click "Rooms" → `RoomsModal` opens. Fetch `SELECT * FROM pit_rooms ORDER BY "updatedAt" DESC LIMIT 100` → render Browse list.
2. Click "Create". Form fields:
   - `name` (required)
   - `nickname` (required, prefilled from `localStorage.pitNickname`)
   - ☐ `Start with my current local data` (default unchecked)
3. On submit:
   - Persist the nickname (`localStorage.pitNickname = nickname`).
   - `INSERT INTO pit_rooms (name, ownerSessionId, ownerNickname, data) VALUES ($1, $me, $nick, $2)` — `data` is `{}` or the current `useRaceStore.raceData` JSON depending on the checkbox.
   - Take the returned row and call `joinRoom(row.id)`.

### 6.3 Join room

1. If `localStorage.pitNickname` is empty → open `NicknameModal` (blocking), save nickname, then continue.
2. `SELECT * FROM pit_rooms WHERE id = $1`.
3. `useRaceStore.setRaceData(row.data)` — store rehydrates; `localStorage.raceData` is untouched.
4. Set `currentRoomId = row.id`, `currentRoom = row`.
5. Subscribe: channel `pit_rooms:${id}`, event `*`, filter `id=eq.${id}`, table `pit_rooms`.
6. On `SUBSCRIBED` status, refetch the row once and rehydrate (covers any race between initial fetch and subscription handshake).

### 6.4 Persist (owner action)

Every existing `saveRaceData()` call from the UI:

1. `lastSavedAt = Date.now()` (write first, use it for echo suppression).
2. `UPDATE pit_rooms SET data = $1, "updatedAt" = now() WHERE id = $2`.
3. On failure, retry once after 500ms; if still failing, toast `"Offline — changes not synced"` (the optimistic local state remains).

### 6.5 Realtime handler

For every `postgres_changes` event on the subscribed row:

1. Capture `prevOwnerSessionId = useRoomStore.getState().currentRoom?.ownerSessionId ?? null` (before the next step mutates it).
2. Update `currentRoom = payload.new as PitRoom`.
3. Self-echo check for the data payload: if `Math.abs(new Date(payload.new.updatedAt).getTime() - lastSavedAt) < 200` **and** `payload.new.ownerSessionId === sessionId` → skip `setRaceData` (owner already has the state, no visual mutation needed).
4. Otherwise: `useRaceStore.setRaceData(payload.new.data)`.
5. Takeover detection: if `payload.new.ownerSessionId !== prevOwnerSessionId && payload.new.ownerSessionId !== sessionId && prevOwnerSessionId === sessionId` → we just lost ownership → show toast `"${payload.new.ownerNickname} took control"`.

### 6.6 Take control (viewer action)

1. If nickname empty → `NicknameModal` first.
2. `lastSavedAt = Date.now()` (so the echo on owner fields doesn't later trigger a spurious rehydrate).
3. `UPDATE pit_rooms SET "ownerSessionId" = $me, "ownerNickname" = $myNick WHERE id = $currentRoomId`.
4. Nothing else — the Realtime echo arrives and `currentRoom` updates; `isOwner` flips to `true` automatically; inputs re-enable; the previous owner sees the takeover toast.

### 6.7 Leave room

1. `supabase.removeChannel(channel)`.
2. Clear `currentRoomId, currentRoom, channel`.
3. Do **not** touch `ownerSessionId` in the row (an absent owner can return and resume).
4. `useRaceStore.loadInitialData()` — returns the client to local mode using preserved `localStorage.raceData`.

### 6.8 Owner vs viewer UI

Every mega-secret-pits control (add team, add event, kart color picker, timer start/stop, etc.) reads `const disabled = useRoomStore(s => !!s.currentRoomId && s.currentRoom?.ownerSessionId !== s.sessionId)` and passes `disabled={disabled}` on its inputs and buttons.

Implementation note: this requires an audit of existing mega-secret-pits components — some have `disabled` props, some use click handlers that need guarding manually. Where a prop isn't available, the click handler short-circuits on the same `disabled` value rather than re-wiring the component's props surface. Visual affordance (greyed text / reduced opacity) is added everywhere the input becomes read-only so viewers see *why* clicks don't work.

`<RoomBanner />` renders:
- **Owner:** `Room: X · You're editing (as Y) · [Leave]`
- **Viewer:** `Room: X · Viewing · Owner: Nikita · [Take control] [Leave]`
- **No owner:** `Room: X · No active owner · [Take control] [Leave]`

## 7. Error handling

| Situation | Behaviour |
|---|---|
| `createRoom` INSERT fails | Toast `"Failed to create room"`, keep the modal open. |
| `listRooms` SELECT fails | Show `"Couldn't load rooms — retry"` in the modal. |
| `joinRoom` SELECT fails or row missing | Toast `"Room not found"`. `currentRoomId` stays `null`. |
| `persistData` UPDATE fails | Each failing save retries itself once after 500 ms. On the second failure, toast `"Offline — changes not synced"` (sticky until the next successful write). Optimistic local state preserved. Subsequent actions still attempt their own writes — retries are per-action, not queued. |
| Realtime channel error / reconnect | `supabase-js` auto-reconnects. On `SUBSCRIBED` after reconnect, refetch the row and rehydrate (covers missed events). |
| Two owners race on claim/persist | Postgres last-write-wins; UI reactively converges. Accepted. |

## 8. Self-echo suppression detail

The owner's own UPDATE echoes back via Realtime (~10-200ms later). Rehydrating the store from that echo causes (a) focusKart loss, (b) UI flicker. Mitigation:

Before the UPDATE fires, `lastSavedAt = Date.now()`. The Realtime handler compares `new.updatedAt` with `lastSavedAt`. If the delta is `< 200 ms` **and** `new.ownerSessionId === sessionId`, skip `setRaceData`. Ownership changes still propagate (we only skip the `data` rehydrate, not the ownership metadata).

Edge case: a very fast real second editor (same `sessionId` somehow) could be suppressed. Impossible in practice: `sessionId` is per-browser; no two tabs share it unless user copies it manually. Accepted.

## 9. Out of scope

- History of edits (decision 2: overwrite, no history).
- URL-routed rooms (decision 4: modal only).
- Authentication and ACL (public anon RLS matches existing tables).
- Server-enforced ownership — any client with anon key can `UPDATE` any row. Accepted for this feature.
- Optimistic conflict resolution beyond last-write-wins.
- Room deletion UX — can be added later; not in this slice.
- Showing all viewers / presence indicators — nicknames of non-owners aren't persisted.

## 10. Risks

- **Write storms.** Every action is a full UPDATE of the jsonb. A busy gamemaster can trigger 10+ writes/second during a pit sequence. Supabase accepts this fine; just something to monitor.
- **Payload size.** `RaceData` with a long event log grows. Practical ceiling ~50 KB; well within PostgREST and Realtime payload limits.
- **Realtime ordering.** Postgres Changes events are serialised on the Realtime server; clients see them in commit order. No client-side reordering needed.
- **lastSavedAt drift.** Uses client clock. If the server clock diverges significantly (~seconds), self-echo suppression can misfire. In practice the delta is sub-second. Not hardening further.
