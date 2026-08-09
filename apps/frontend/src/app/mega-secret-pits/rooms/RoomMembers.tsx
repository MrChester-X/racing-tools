'use client';
import { RoomMember } from './types';
import { countOnline, hasOfflineOwner } from './members';

/** Один чипс на человека: точка статуса, ★ у админа, ник, «вы» у себя. */
export function MemberChips({
  members,
  className = '',
}: {
  members: RoomMember[];
  className?: string;
}) {
  if (!members.length) return null;

  return (
    <div className={`flex items-center gap-1 overflow-x-auto ${className}`}>
      {members.map((m) => (
        <span
          key={m.sessionId}
          title={`${m.nickname}${m.isOwner ? ' · админ' : ''}${m.isOnline ? '' : ' · оффлайн'}`}
          className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] leading-none ${
            m.isOnline
              ? 'border-white/10 bg-white/[0.04] text-gray-200'
              : 'border-white/5 bg-transparent text-gray-500'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              m.isOnline ? 'bg-green-400' : 'bg-gray-600'
            }`}
          />
          {m.isOwner && (
            <span className={m.isOnline ? 'text-orange-300' : 'text-orange-300/40'}>★</span>
          )}
          <span className="truncate max-w-[90px]">{m.nickname}</span>
          {m.isSelf && <span className="text-gray-500">· вы</span>}
        </span>
      ))}
    </div>
  );
}

/** Свёрнутый вид для мобильной полоски: «👥4», жёлтый если админ оффлайн. */
export function MembersPill({
  members,
  open,
  onToggle,
}: {
  members: RoomMember[];
  open: boolean;
  onToggle: () => void;
}) {
  if (!members.length) return null;

  const online = countOnline(members);
  const ownerAway = hasOfflineOwner(members);

  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      title={ownerAway ? 'Админ оффлайн' : `${online} онлайн`}
      className={`flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[11px] font-bold leading-none ${
        ownerAway
          ? 'border-yellow-500/40 text-yellow-300'
          : 'border-white/10 text-gray-200'
      } ${open ? 'bg-white/10' : 'bg-white/[0.04]'}`}
    >
      <span>👥</span>
      <span>{online}</span>
    </button>
  );
}
