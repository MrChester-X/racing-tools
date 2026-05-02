# Mega-secret-pits linked heat — design

**Date:** 2026-04-19
**Status:** Approved

## 1. Summary

Optional ability on `/mega-secret-pits` to link an existing heat (from `heats` / `laps` tables, written by timing-parser). When linked: a header banner shows the heat name, every team row gets a live overlay (`pos · lap N · last · best · gap`) updated via Realtime, and a button in the new modal imports teams + their start karts from that heat.

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Link semantics | Live overlay (option C). Optional — works with or without a link. |
| 2 | Storage of `linkedHeatId` | Added to `RaceData.linkedHeatId` (option A). Persists via the existing `saveRaceData` source-aware flow (localStorage in local mode, `pit_rooms.data` in room mode). |
| 3 | Modal entry point | Header button **🔗 Heat** next to **🏠 Rooms** (option A). Mini green dot when linked. |
| 4 | Import semantics | Additive merge (option A). Add only teams whose `startKart` is not already in `raceData.teams`. **Do not touch `startPitlane`.** Source of `startKart` is each team's earliest lap (smallest `lapCount`). |
| 5 | Live-overlay match key | `lap.kart === team.startKart`. Works perfectly for racemann (kart = `comp.rn`, constant). For sms-timing post-pit, only first-stint laps match — accepted. |
| 6 | Overlay fields + placement | `pos · lap N · last · best · gap` (option B), under the team name in `TeamsList`/`TeamRow` (option I). |

## 3. Module layout

New: `race-time-front/src/app/mega-secret-pits/linked-heat/`

```
linked-heat/
├── linkedHeatClient.ts        Supabase queries (listHeats, loadHeat, fetchAllLaps, listKartodroms)
├── useLinkedHeatStore.ts      heat / latestByKart / bestByKart / firstLapByKart / channel; setLinkedHeat lifecycle
├── LinkedHeatModal.tsx        Browse + Currently-linked block
├── LinkedHeatBanner.tsx       "🔗 Linked: ..." pill under RoomBanner
└── importTeams.ts             pure function buildTeamsFromFirstLaps + merge into RaceData
```

`HeatItem` and `LapItem` are re-imported from `@/app/heats/types` (already defined). Helper `formatTime(ms)` is duplicated locally to avoid cross-import from a route file (small enough).

## 4. Modified files

- `race-time-front/src/app/mega-secret-pits/types.ts` — add `linkedHeatId?: string | null` to `RaceData`.
- `race-time-front/src/app/mega-secret-pits/store/useRaceStore.ts` — new `setLinkedHeat(id: string | null)` action with viewer-lock guard; new `importTeamsFromLinkedHeat()` that consumes `useLinkedHeatStore.firstLapByKart` and applies additive merge.
- `race-time-front/src/app/mega-secret-pits/page.tsx` — header **🔗 Heat** button, mount `<LinkedHeatBanner />` (after `<RoomBanner />`), mount `<LinkedHeatModal />`, attach watcher (`useLinkedHeatStore.attachWatch()`).
- `race-time-front/src/app/mega-secret-pits/components/TeamRow.tsx` — render overlay block under the existing name row when `useLinkedHeatStore.heat` is non-null. Show `— · waiting` if no data yet for this team's `startKart`.

## 5. Data flow

### 5.1 Setting a link

```
LinkedHeatModal click "Link" → useRaceStore.setLinkedHeat(id)
  → check isViewerLocked() → if viewer, no-op
  → setRaceData({ ...raceData, linkedHeatId: id }) → saveRaceData()
  → useLinkedHeatStore zustand-watcher fires (subscribed to raceData.linkedHeatId)
  → setLinkedHeat(id) inside the watcher:
     - bump loadingToken (cancels stale in-flight loads)
     - unsubscribe previous channel (if any)
     - loadHeat(id) → state.heat
     - fetchAllLaps(id) → reduce into latestByKart, bestByKart, firstLapByKart
     - subscribe channel `linked_heat:${id}:${Date.now()}` on laps where heatId=eq.${id}, event=*
     - on each event, apply(payload.new) incrementally
```

### 5.2 Unlinking / changing

`setLinkedHeat(null)` follows the same path — watcher unsubscribes channel, clears maps, sets `heat: null`.

### 5.3 Initial mount

`page.tsx` `useEffect` calls `useLinkedHeatStore.getState().attachWatch()` — returns cleanup. The watcher reads the initial `raceData?.linkedHeatId` and calls `setLinkedHeat(initial)` if present. Also subscribes to subsequent changes.

### 5.4 Incremental apply

```ts
function apply(lap: LapItem) {
  const prev = latestByKart.get(lap.kart);
  if (!prev || lap.lapCount > prev.lapCount) latestByKart.set(lap.kart, lap);

  const prevBest = bestByKart.get(lap.kart);
  if (prevBest === undefined || lap.time < prevBest) bestByKart.set(lap.kart, lap.time);

  const prevFirst = firstLapByKart.get(lap.kart);
  if (!prevFirst || lap.lapCount < prevFirst.lapCount) firstLapByKart.set(lap.kart, lap);
}
```

No refetch on event — only inserts mutate the maps. Avoids the lap-storm refetch problem.

### 5.5 Import algorithm

```ts
function importTeamsFromLinkedHeat() {
  if (isViewerLocked()) return { added: 0, skipped: 0 };
  const raceData = useRaceStore.getState().raceData;
  if (!raceData) return { added: 0, skipped: 0 };

  const firstLaps = Array.from(useLinkedHeatStore.getState().firstLapByKart.values());
  const existing = new Set(raceData.teams.map((t) => t.startKart));

  const toAdd = firstLaps
    .filter((lap) => !existing.has(lap.kart))
    .map((lap) => ({ name: lap.driverName, startKart: lap.kart }));

  const updated = { ...raceData, teams: [...raceData.teams, ...toAdd] };
  useRaceStore.getState().setRaceData(updated);
  useRaceStore.getState().saveRaceData();
  return { added: toAdd.length, skipped: firstLaps.length - toAdd.length };
}
```

## 6. UI

### 6.1 Header button

```tsx
<button onClick={() => setIsLinkedHeatOpen(true)}>
  🔗 Heat
  {linkedHeatId && <span className="ml-1 inline-block w-1.5 h-1.5 bg-green-400 rounded-full" />}
</button>
```

Disabled with `opacity-50 cursor-not-allowed` when `isViewer` is true (matches the pattern of existing mutating header buttons).

### 6.2 LinkedHeatBanner

Renders under `RoomBanner`, before `<header>`, only when `linkedHeatId !== null`:

```
🔗 Linked: <heat.name> · <kartodromId> · [open ↗] [unlink]
```

If `loadHeat` returned `null` (heat deleted server-side), show `🔗 Linked heat not found · [Unlink]`. Don't auto-clear `linkedHeatId` — user decides.

`[unlink]` button is disabled when `isViewer` is true.

### 6.3 LinkedHeatModal

Top section (only when `linkedHeatId !== null`):

```
🔗 <heat.name> · <kartodrom>
[Import teams + start karts (adds N, skips M)] [Unlink]
```

`[Import]` is disabled when `firstLapByKart.size === 0` (race not yet started).

Bottom section: Browse list with kartodrom filter (dynamic, like `/heats`). Per-row `[Link]` button; if the row id matches current `linkedHeatId`, show `Linked` (disabled).

### 6.4 TeamRow overlay

Append a one-line block under the existing team name + kart info:

```
🔗 P3 · lap 47 · last 51.234 · best 49.987 · gap +12.4
```

If `useLinkedHeatStore.heat === null` → don't render the block.
If `latestByKart.get(team.startKart) === undefined` → render `🔗 — · waiting`.

Color coding for `last` / `best`:
- `best` is purple if it equals `Math.min(...bestByKart.values())` (absolute best) — otherwise green.
- `last` is white default; green if `last === best` (this lap is the best).

`gap` source: `lap.meta?.gap ?? '—'`. (sms-timing parser sets it; racemann does not yet — accepted.)

## 7. Edge cases

| Case | Behaviour |
|---|---|
| Linked heat deleted server-side | Banner shows "Linked heat not found", overlay vanishes. Link stays until user unlinks. |
| `fetchAllLaps` fails | Toast `"Failed to load linked heat data"`. Previous maps preserved. |
| Realtime disconnects | supabase-js auto-reconnects; on `SUBSCRIBED` after reconnect, refetch all laps and rebuild maps. |
| Huge race (7000+ laps) | Pagination of 1000 on initial fetch (matches `/heats/[id]` pattern). Subsequent: incremental apply only. |
| User flips link during in-flight load | `loadingToken` (incremented per `setLinkedHeat`) — stale fetch results discarded. |
| sms-timing post-pit laps | `lap.kart` changes → no match. Overlay shows only first-stint laps for those teams. Accepted. |
| Room viewer | All link-mutating actions short-circuit via `isViewerLocked`. View-only state via Realtime + saveRaceData no-op already covers it. |
| Two clients in same room: both have linked overlay | Each subscribes to laps independently (Supabase Realtime fanout — no extra cost). |

## 8. Out of scope

- Computing `gap` for racemann sources (could be added to racemann mapper later — not needed for this slice).
- Live-overlay on pitlane karts in `PitlaneVisualization` (option II from Q6 — only `TeamsList` for now).
- Multiple linked heats simultaneously (single id only).
- Backfilling laps for missed time periods if the client was offline (handled by reconnect refetch).
- Unlinking when linked heat row deleted server-side (manual user action).

## 9. Implementation order

1. Type extension + RaceData migration-shim (none needed — optional field).
2. `linkedHeatClient.ts` (Supabase queries, including paginated `fetchAllLaps`).
3. `useLinkedHeatStore.ts` (state, attachWatch, setLinkedHeat, apply).
4. `importTeams.ts` (pure logic).
5. `LinkedHeatModal.tsx`.
6. `LinkedHeatBanner.tsx`.
7. Patch `useRaceStore.ts` — `setLinkedHeat` action wrapper + viewer guard.
8. Patch `page.tsx` — header button, mount banner + modal, attachWatch.
9. Patch `TeamRow.tsx` — overlay block.
10. `npx tsc --noEmit` green on `race-time-front`.
