'use client';
import { useRef, useState, useCallback } from 'react';
import { useParseStore } from '../store/useParseStore';
import { useAuthStore } from '@/store/useAuthStore';

export function VideoEditorSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    videoFile, setVideoFile, setVideoDuration,
    offset, setOffset,
    videoDuration, selectedDriver, isSubmitting, submitJob, uploadProgress, submitError,
  } = useParseStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const [fileError, setFileError] = useState<string | null>(null);
  const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB

  const handleFileChange = useCallback((file: File | null) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setFileError(null);
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        setFileError('File is too large. Maximum size is 2 GB.');
        return;
      }
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setVideoFile(file);
    } else {
      setVideoUrl(null);
      setVideoFile(null);
    }
  }, [videoUrl, setVideoFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('video/')) handleFileChange(file);
  }, [handleFileChange]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) setVideoDuration(videoRef.current.duration);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const stepFrame = (dir: number) => seekTo((videoRef.current?.currentTime || 0) + dir / 30);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.pause();
    else videoRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(2);
    return `${m}:${sec.padStart(5, '0')}`;
  };

  const Slider = ({ label, value, onChange, min, max, color, onSet }: {
    label: string; value: number; onChange: (v: number) => void;
    min: number; max: number; color: string; onSet: () => void;
  }) => (
    <div>
      <div className="flex justify-between items-center text-xs mb-1.5">
        <span className="text-gray-500 uppercase tracking-wider">{label}</span>
        <span className={`font-mono font-medium ${color}`}>{fmt(value)}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range" min={min} max={max} step={0.033} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className={`flex-1 h-1.5 rounded-full appearance-none bg-white/[0.06] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer`}
        />
        <button onClick={onSet} className="text-[10px] text-gray-500 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] px-2 py-1 rounded transition-colors uppercase tracking-wider">
          Set
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 bg-gradient-to-b from-purple-500 to-purple-600 rounded-full" />
        <h2 className="text-lg font-bold text-white tracking-wide uppercase">Video Editor</h2>
      </div>

      {!videoUrl ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border border-dashed border-white/[0.08] rounded-2xl p-16 text-center hover:border-orange-500/20 hover:bg-orange-500/[0.02] transition-all cursor-pointer group"
          onClick={() => document.getElementById('video-input')?.click()}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center group-hover:border-orange-500/20 transition-colors">
            <svg className="w-8 h-8 text-gray-600 group-hover:text-orange-500/60 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm mb-1">Drop video here</p>
          <p className="text-gray-700 text-xs">or click to browse · max 2 GB</p>
          {fileError && <p className="text-red-400 text-xs mt-2">{fileError}</p>}
          <input id="video-input" type="file" accept="video/*" className="hidden" onChange={(e) => handleFileChange(e.target.files?.[0] || null)} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Player */}
          <div className="relative rounded-2xl overflow-hidden bg-black border border-white/[0.05] shadow-2xl shadow-black/50">
            <video
              ref={videoRef} src={videoUrl} controls
              onLoadedMetadata={handleLoadedMetadata} onTimeUpdate={handleTimeUpdate}
              onPause={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)}
              className="w-full max-h-[480px]"
            />
          </div>

          {/* Controls bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-white/[0.03] border border-white/[0.06] rounded-xl p-1 gap-1">
              <button onClick={() => stepFrame(-1)} className="text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/[0.06] text-xs font-medium transition-all">-1f</button>
              <button onClick={togglePlay} className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-1.5 rounded-lg text-xs font-bold transition-all tracking-wide">
                {isPlaying ? 'PAUSE' : 'PLAY'}
              </button>
              <button onClick={() => stepFrame(1)} className="text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/[0.06] text-xs font-medium transition-all">+1f</button>
            </div>
            <div className="flex-1" />
            <span className="text-gray-600 font-mono text-xs">{fmt(currentTime)} / {fmt(videoDuration)}</span>
            <button onClick={() => handleFileChange(null)} className="text-gray-600 hover:text-red-400 text-xs transition-colors">Remove</button>
          </div>

          {/* Seek bar */}
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 space-y-5">
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="text-gray-500 uppercase tracking-wider">Position</span>
                <span className="font-mono font-medium text-white">{fmt(currentTime)}</span>
              </div>
              <input
                type="range" min={0} max={videoDuration} step={0.033} value={currentTime}
                onChange={(e) => seekTo(parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none bg-white/[0.06] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer"
              />
            </div>
            <Slider label="Offset" value={offset} onChange={setOffset} min={0} max={videoDuration} color="text-orange-400" onSet={() => setOffset(currentTime)} />
          </div>

          {/* Submit */}
          <button
            onClick={submitJob}
            disabled={isSubmitting || !selectedDriver || !isAuthenticated}
            className="w-full relative overflow-hidden bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 text-white font-bold py-4 rounded-2xl disabled:opacity-20 disabled:cursor-not-allowed transition-all text-sm tracking-widest uppercase shadow-xl shadow-orange-600/20 hover:shadow-orange-500/30"
          >
            {isSubmitting && (
              <div
                className="absolute inset-0 bg-white/[0.15] transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            )}
            <span className="relative">
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-3">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {uploadProgress < 100 ? `Uploading... ${uploadProgress}%` : 'Creating job...'}
                </span>
              ) : 'Start Render'}
            </span>
          </button>
          {!isAuthenticated && <p className="text-orange-500/40 text-xs text-center uppercase tracking-wider">Log in to start rendering</p>}
          {isAuthenticated && !selectedDriver && <p className="text-orange-500/40 text-xs text-center uppercase tracking-wider">Select a driver first</p>}
          {submitError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
              <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-400 text-xs">{submitError}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
