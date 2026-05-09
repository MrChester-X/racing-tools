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
  const {
    rooms,
    isLoading,
    nickname,
    sessionId,
    refreshRooms,
    createRoom,
    joinRoom,
    setNickname,
  } = useRoomStore();
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
                <input
                  type="checkbox"
                  checked={useLocal}
                  onChange={(e) => setUseLocal(e.target.checked)}
                />
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
