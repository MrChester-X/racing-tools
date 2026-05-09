'use client';
import { useParseStore } from '../store/useParseStore';
import { useAuthStore } from '@/store/useAuthStore';
import { formatDuration } from '../utils/formatDuration';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export function JobModal() {
  const { selectedJob, isModalOpen, closeJobModal, rerenderJob, archiveJob } = useParseStore();
  const { isAuthenticated, user: authUser } = useAuthStore();
  const isAdmin = authUser?.role === 'admin';

  if (!isModalOpen || !selectedJob) return null;

  const statusConfig: Record<string, { dot: string; label: string; glow?: string }> = {
    pending: { dot: 'bg-yellow-400', label: 'Queued' },
    processing: { dot: 'bg-blue-400 animate-pulse', label: 'Rendering...', glow: 'shadow-blue-500/30' },
    done: { dot: 'bg-green-400', label: 'Complete' },
    error: { dot: 'bg-red-400', label: 'Failed' },
  };

  const cfg = statusConfig[selectedJob.status];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={closeJobModal}>
      <div
        className="bg-[#0c0c14] rounded-2xl border border-white/[0.06] max-w-lg w-full mx-4 shadow-2xl shadow-black/60 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="px-6 pt-5 pb-4 border-b border-white/[0.04]">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-white font-bold text-base truncate">{selectedJob.driverName}</h3>
                <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot} ${cfg.glow ? `shadow-lg ${cfg.glow}` : ''}`} />
                <span className="text-gray-600 text-[10px] tracking-wider uppercase shrink-0">{cfg.label}</span>
              </div>
              {selectedJob.raceName && (
                <p className="text-gray-500 text-xs truncate mt-0.5">{selectedJob.raceName}</p>
              )}
            </div>
            <button
              onClick={closeJobModal}
              className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] flex items-center justify-center text-gray-500 hover:text-white transition-all shrink-0 ml-3"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/[0.03] rounded-xl py-3 px-2 text-center">
              <span className="text-gray-600 text-[9px] uppercase tracking-[2px] block">Offset</span>
              <span className="text-white font-mono text-sm mt-1 block">{selectedJob.offset.toFixed(2)}s</span>
            </div>
            <div className="bg-white/[0.03] rounded-xl py-3 px-2 text-center">
              <span className="text-gray-600 text-[9px] uppercase tracking-[2px] block">Video</span>
              <span className="text-white font-mono text-sm mt-1 block">
                {selectedJob.videoDurationSec != null ? formatDuration(selectedJob.videoDurationSec) : '—'}
              </span>
            </div>
            <div className="bg-white/[0.03] rounded-xl py-3 px-2 text-center">
              <span className="text-gray-600 text-[9px] uppercase tracking-[2px] block">Upload</span>
              <span className="text-white font-mono text-sm mt-1 block">
                {selectedJob.uploadDurationMs != null ? formatDuration(selectedJob.uploadDurationMs / 1000) : '—'}
              </span>
            </div>
            <div className="bg-white/[0.03] rounded-xl py-3 px-2 text-center">
              <span className="text-gray-600 text-[9px] uppercase tracking-[2px] block">Render</span>
              <span className="text-white font-mono text-sm mt-1 block">
                {selectedJob.renderDurationMs != null ? formatDuration(selectedJob.renderDurationMs / 1000) : '—'}
              </span>
            </div>
          </div>

          {/* Race URL */}
          <div className="bg-white/[0.02] rounded-xl px-4 py-3">
            <p className="text-gray-500 text-xs font-mono break-all leading-relaxed">{selectedJob.raceUrl}</p>
          </div>

          {/* Error */}
          {selectedJob.errorMessage && (
            <div className="bg-red-500/[0.06] border border-red-500/10 rounded-xl px-4 py-3">
              <p className="text-red-400 text-xs leading-relaxed">{selectedJob.errorMessage}</p>
            </div>
          )}

          {/* Meta row: date + user */}
          <div className="flex items-center justify-between">
            <span className="text-gray-700 text-[11px] font-mono">
              {new Date(selectedJob.createdAt).toLocaleString()}
            </span>
            {selectedJob.user && (
              <div className="flex items-center gap-2">
                {selectedJob.user.photo ? (
                  <img src={selectedJob.user.photo} alt="" className="w-5 h-5 rounded-full ring-1 ring-white/10" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center">
                    <span className="text-gray-500 text-[9px] font-bold">
                      {(selectedJob.user.firstName || selectedJob.user.username || '?')[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="text-white/70 text-[11px]">
                  {selectedJob.user.firstName || selectedJob.user.username || 'User'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 pb-5 flex gap-2">
          {isAdmin && (
            <button
              onClick={archiveJob}
              className="flex-1 bg-white/[0.05] border border-red-500/20 hover:bg-red-500/[0.08] hover:border-red-500/30 text-red-400 hover:text-red-300 font-semibold py-3 rounded-xl text-center transition-all text-xs tracking-widest uppercase"
            >
              Archive
            </button>
          )}
          <button
            onClick={rerenderJob}
            disabled={!isAuthenticated}
            className={`flex-1 font-semibold py-3 rounded-xl text-center transition-all text-xs tracking-widest uppercase border ${
              isAuthenticated
                ? 'bg-white/[0.05] border-white/[0.08] hover:bg-white/[0.1] hover:border-white/[0.15] text-gray-300 hover:text-white'
                : 'bg-white/[0.02] border-white/[0.04] text-gray-600 cursor-not-allowed'
            }`}
          >
            Re-render
          </button>
          {selectedJob.sourceDownloadUrl && (
            <a
              href={selectedJob.sourceDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.1] hover:border-white/[0.15] text-gray-300 hover:text-white font-semibold py-3 rounded-xl text-center transition-all text-xs tracking-widest uppercase"
            >
              Source
            </a>
          )}
          {selectedJob.downloadUrl && (
            <a
              href={selectedJob.downloadUrl.startsWith('/') ? `${API_URL}${selectedJob.downloadUrl}` : selectedJob.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 text-white font-semibold py-3 rounded-xl text-center transition-all text-xs tracking-widest uppercase shadow-lg shadow-orange-600/20 hover:shadow-orange-500/30"
            >
              Download
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
