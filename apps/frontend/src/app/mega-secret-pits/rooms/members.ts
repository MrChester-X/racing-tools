'use client';
import { useMemo } from 'react';
import { useRoomStore } from './useRoomStore';
import { PitRoom, RoomMember, RoomPresenceEntry } from './types';

const NO_NAME = 'Без имени';

/**
 * Merges live presence with the room's owner into one renderable list.
 *
 * Presence only knows who is connected right now, so the single "offline" case
 * we can show is the owner: they keep control of the room after closing the tab,
 * and seeing them greyed out explains why nobody is editing.
 */
export function buildMembers(
  presence: RoomPresenceEntry[],
  room: PitRoom | null,
  selfSessionId: string,
): RoomMember[] {
  const ownerSessionId = room?.ownerSessionId ?? null;

  const members: RoomMember[] = presence.map((p) => ({
    sessionId: p.sessionId,
    nickname: p.nickname || NO_NAME,
    joinedAt: p.joinedAt,
    isOnline: true,
    isOwner: !!ownerSessionId && p.sessionId === ownerSessionId,
    isSelf: p.sessionId === selfSessionId,
  }));

  if (ownerSessionId && !members.some((m) => m.sessionId === ownerSessionId)) {
    members.push({
      sessionId: ownerSessionId,
      nickname: room?.ownerNickname || NO_NAME,
      joinedAt: 0,
      isOnline: false,
      isOwner: true,
      isSelf: ownerSessionId === selfSessionId,
    });
  }

  return members.sort(compareMembers);
}

/** Online first, owner ahead of the rest, then stable by join order. */
function compareMembers(a: RoomMember, b: RoomMember): number {
  if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
  if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
  if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
  return a.nickname.localeCompare(b.nickname);
}

export function countOnline(members: RoomMember[]): number {
  return members.filter((m) => m.isOnline).length;
}

export function hasOfflineOwner(members: RoomMember[]): boolean {
  return members.some((m) => m.isOwner && !m.isOnline);
}

/**
 * Recomputes on both presence changes and owner changes (the latter arrives via
 * postgres_changes), so a takeover re-badges the admin without a presence event.
 */
export function useRoomMembers(): RoomMember[] {
  const presence = useRoomStore((s) => s.presence);
  const currentRoom = useRoomStore((s) => s.currentRoom);
  const sessionId = useRoomStore((s) => s.sessionId);
  return useMemo(
    () => buildMembers(presence, currentRoom, sessionId),
    [presence, currentRoom, sessionId],
  );
}
