'use client';
import { useState } from 'react';
import { useRoomStore } from './useRoomStore';
import { NicknameModal } from './NicknameModal';
import { useRoomMembers } from './members';
import { MemberChips } from './RoomMembers';

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
  const members = useRoomMembers();

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
          {saveStatus === 'retrying' && <span className="text-yellow-400">· Saving…</span>}
          {saveStatus === 'offline' && (
            <span className="text-red-400">· Offline — changes not synced</span>
          )}
          <MemberChips members={members} className="min-w-0" />
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
