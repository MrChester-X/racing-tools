'use client';
import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

const PARSER_URL = process.env.NEXT_PUBLIC_PARSER_URL || 'http://localhost:3001';

interface ImportResponse {
  heatId: string;
  heatName: string;
  lapsInserted: number;
  stintsFetched: number;
  errors: Array<{ stint: string; message: string }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ImportRaceModal({ open, onClose }: Props) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const { data } = await axios.post<ImportResponse>(
        `${PARSER_URL}/racemann/import`,
        { url: url.trim(), name: name.trim() },
        { timeout: 60_000 },
      );
      router.push(`/heats/${data.heatId}`);
      onClose();
    } catch (err) {
      const msg =
        (axios.isAxiosError(err) && (err.response?.data?.message as string)) ||
        (err as Error).message ||
        'Import failed';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#0a0a0f] p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 bg-gradient-to-b from-orange-500 to-amber-600 rounded-full" />
          <h3 className="text-white text-sm font-bold uppercase tracking-wide">Import race</h3>
        </div>

        <div className="space-y-1">
          <label className="text-gray-500 text-[10px] uppercase tracking-wider">Racemann URL</label>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://pitstop.racemann.com/Race/id/…"
            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-orange-500/40"
            disabled={isLoading}
          />
        </div>

        <div className="space-y-1">
          <label className="text-gray-500 text-[10px] uppercase tracking-wider">Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Endurance 5h – 2026-04-19"
            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/40"
            disabled={isLoading}
          />
        </div>

        {error && <div className="text-red-400 text-xs">{error}</div>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 text-xs font-medium hover:text-white hover:bg-white/[0.04] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading || !url || !name}
            className="px-4 py-1.5 rounded-lg bg-orange-500 text-black text-xs font-bold uppercase tracking-wider hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </form>
    </div>
  );
}
