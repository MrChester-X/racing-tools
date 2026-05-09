export interface PitRoom {
  id: string;
  name: string;
  ownerSessionId: string | null;
  ownerNickname: string | null;
  data: unknown;
  createdAt: string;
  updatedAt: string;
}
