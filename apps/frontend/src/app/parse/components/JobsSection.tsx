'use client';
import { useEffect } from 'react';
import { useParseStore } from '../store/useParseStore';
import { useAuthStore } from '@/store/useAuthStore';
import { formatDuration } from '../utils/formatDuration';

export function JobsSection() {
  const { jobs, jobsTotal, jobsPage, jobsLimit, jobsFilter, loadJobs, isLoadingJobs, openJobModal, setJobsPage, setJobsFilter } = useParseStore();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 5000);
    return () => clearInterval(interval);
  }, [loadJobs]);

  const totalPages = Math.max(1, Math.ceil(jobsTotal / jobsLimit));

  const statusConfig: Record<string, { border: string; dot: string; label: string; bg: string }> = {
    pending: { border: 'border-yellow-500/10', dot: 'bg-yellow-400', label: 'Queued', bg: 'bg-yellow-500/[0.03]' },
    processing: { border: 'border-blue-500/10', dot: 'bg-blue-400 animate-pulse', label: 'Rendering...', bg: 'bg-blue-500/[0.03]' },
    done: { border: 'border-green-500/10', dot: 'bg-green-400', label: 'Complete', bg: 'bg-green-500/[0.03]' },
    error: { border: 'border-red-500/10', dot: 'bg-red-400', label: 'Failed', bg: 'bg-red-500/[0.03]' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-gradient-to-b from-green-500 to-emerald-600 rounded-full" />
          <h2 className="text-lg font-bold text-white tracking-wide uppercase">Render Queue</h2>
        </div>
        <div className="flex items-center gap-3">
          {isLoadingJobs && <div className="w-3 h-3 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />}
          <span className="text-gray-600 text-xs">{jobsTotal} jobs</span>
          {isAuthenticated && (
            <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06]">
              <button
                onClick={() => setJobsFilter('all')}
                className={`px-3 py-1 rounded-md text-[11px] font-medium tracking-wide transition-all ${
                  jobsFilter === 'all'
                    ? 'bg-white/[0.08] text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setJobsFilter('mine')}
                className={`px-3 py-1 rounded-md text-[11px] font-medium tracking-wide transition-all ${
                  jobsFilter === 'mine'
                    ? 'bg-white/[0.08] text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Mine
              </button>
            </div>
          )}
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-gray-800 text-xs uppercase tracking-[4px]">No render jobs yet</div>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => {
            const cfg = statusConfig[job.status];
            return (
              <div
                key={job.id}
                onClick={() => openJobModal(job)}
                className={`border ${cfg.border} ${cfg.bg} rounded-xl px-5 py-4 cursor-pointer hover:bg-white/[0.03] transition-all group`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-medium truncate">
                          {job.raceName ? `${job.raceName} · ${job.driverName}` : job.driverName}
                        </span>
                        <span className="text-gray-600 text-xs shrink-0">{cfg.label}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-gray-700 text-[11px] font-mono">
                          {new Date(job.createdAt).toLocaleString()}
                        </span>
                        {job.videoDurationSec != null && (
                          <span className="text-gray-600 text-[11px] font-mono">{formatDuration(job.videoDurationSec)}</span>
                        )}
                        {job.renderDurationMs != null && (
                          <span className="text-gray-700 text-[11px] font-mono">{formatDuration(job.renderDurationMs / 1000)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {job.user && (
                      <>
                        {job.user.photo ? (
                          <img src={job.user.photo} alt="" className="w-5 h-5 rounded-full ring-1 ring-white/10" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center">
                            <span className="text-gray-500 text-[9px] font-bold">
                              {(job.user.firstName || job.user.username || '?')[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                        <span className="text-white/70 text-[11px] hidden sm:inline">
                          {job.user.firstName || job.user.username || 'User'}
                        </span>
                      </>
                    )}
                    <span className="text-gray-700 group-hover:text-gray-500 transition-colors">→</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setJobsPage(jobsPage - 1)}
            disabled={jobsPage <= 1}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              jobsPage <= 1
                ? 'border-white/[0.04] text-gray-700 cursor-not-allowed'
                : 'border-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            ←
          </button>
          <span className="text-gray-500 text-xs font-mono">
            {jobsPage} / {totalPages}
          </span>
          <button
            onClick={() => setJobsPage(jobsPage + 1)}
            disabled={jobsPage >= totalPages}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              jobsPage >= totalPages
                ? 'border-white/[0.04] text-gray-700 cursor-not-allowed'
                : 'border-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
