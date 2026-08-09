export interface PitRoom {
  id: string;
  name: string;
  ownerSessionId: string | null;
  ownerNickname: string | null;
  data: unknown;
  createdAt: string;
  updatedAt: string;
}

/** What each client broadcasts about itself over the room's presence channel. */
export interface RoomPresencePayload {
  sessionId: string;
  nickname: string;
  joinedAt: number;
}

/** One person online in the room — presence entries collapsed to one per session. */
export type RoomPresenceEntry = RoomPresencePayload;

/** A row in the "who's in the room" list, ready to render. */
export interface RoomMember {
  sessionId: string;
  nickname: string;
  joinedAt: number;
  isOnline: boolean;
  isOwner: boolean;
  isSelf: boolean;
}
