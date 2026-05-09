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
