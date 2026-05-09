import { create } from 'zustand';
import axios from 'axios';
import { api } from '@/lib/api';
import { RaceData, DriverData, VideoJob } from '../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface ParseState {
  raceUrl: string;
  raceData: RaceData | null;
  selectedDriver: DriverData | null;
  isLoadingRace: boolean;
  raceError: string | null;

  videoFile: File | null;
  videoDuration: number;
  offset: number;

  jobs: VideoJob[];
  jobsTotal: number;
  jobsPage: number;
  jobsLimit: number;
  jobsFilter: 'all' | 'mine';
  isLoadingJobs: boolean;
  selectedJob: VideoJob | null;
  isModalOpen: boolean;

  isSubmitting: boolean;
  uploadProgress: number; // 0-100
  submitError: string | null;

  setRaceUrl: (url: string) => void;
  loadRace: () => Promise<void>;
  selectDriver: (driver: DriverData | null) => void;
  setVideoFile: (file: File | null) => void;
  setVideoDuration: (duration: number) => void;
  setOffset: (offset: number) => void;
  submitJob: () => Promise<void>;
  loadJobs: () => Promise<void>;
  setJobsPage: (page: number) => void;
  setJobsFilter: (filter: 'all' | 'mine') => void;
  openJobModal: (job: VideoJob) => void;
  closeJobModal: () => void;
  rerenderJob: () => Promise<void>;
  archiveJob: () => Promise<void>;
}

let jobsAbortController: AbortController | null = null;

export const useParseStore = create<ParseState>((set, get) => ({
  raceUrl: '',
  raceData: null,
  selectedDriver: null,
  isLoadingRace: false,
  raceError: null,
  videoFile: null,
  videoDuration: 0,
  offset: 0,
  jobs: [],
  jobsTotal: 0,
  jobsPage: 1,
  jobsLimit: 20,
  jobsFilter: 'all',
  isLoadingJobs: false,
  selectedJob: null,
  isModalOpen: false,
  isSubmitting: false,
  uploadProgress: 0,
  submitError: null,

  setRaceUrl: (url) => set({ raceUrl: url }),

  loadRace: async () => {
    const { raceUrl } = get();
    if (!raceUrl) return;
    set({ isLoadingRace: true, raceError: null });
    try {
      const { data } = await axios.get<RaceData>(`${API_URL}/parser/race`, {
        params: { url: raceUrl },
      });
      set({ raceData: data, isLoadingRace: false, selectedDriver: null });
    } catch (error: any) {
      set({ raceError: error?.response?.data?.message || error.message || 'Failed to load race', isLoadingRace: false });
    }
  },

  selectDriver: (driver) => set({ selectedDriver: driver }),

  setVideoFile: (file) => set({ videoFile: file }),
  setVideoDuration: (duration) => set({ videoDuration: duration }),
  setOffset: (offset) => set({ offset }),

  submitJob: async () => {
    const { videoFile, raceUrl, selectedDriver, offset, raceData, videoDuration } = get();
    if (!videoFile || !selectedDriver || !raceData) return;
    set({ isSubmitting: true, uploadProgress: 0, submitError: null });
    try {
      const { data: uploadResult } = await api.get<{ url: string; key: string }>(
        '/video-jobs/upload-url',
      );

      const uploadStart = Date.now();
      try {
        await axios.put(uploadResult.url, videoFile, {
          headers: { 'Content-Type': 'video/mp4' },
          onUploadProgress: (progressEvent) => {
            const percent = progressEvent.total
              ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
              : 0;
            set({ uploadProgress: percent });
          },
        });
      } catch (error: any) {
        if (axios.isCancel(error)) {
          throw new Error('Upload cancelled');
        }
        throw new Error('Failed to upload video to S3. Check your connection and try again.');
      }
      const uploadDurationMs = Date.now() - uploadStart;

      try {
        await api.post('/video-jobs', {
          raceUrl,
          driverName: selectedDriver.name,
          offset,
          videoDurationSec: videoDuration,
          uploadDurationMs,
          sourceVideoS3Key: uploadResult.key,
          raceData,
        });
      } catch (error: any) {
        const msg = error?.response?.data?.message;
        throw new Error(msg || 'Failed to create render job. Video was uploaded but job creation failed.');
      }

      set({ isSubmitting: false, uploadProgress: 0 });
      get().loadJobs();
    } catch (error: any) {
      set({
        isSubmitting: false,
        uploadProgress: 0,
        submitError: error?.message || 'Something went wrong',
      });
    }
  },

  loadJobs: async () => {
    if (jobsAbortController) jobsAbortController.abort();
    jobsAbortController = new AbortController();
    const { signal } = jobsAbortController;

    const { jobsPage, jobsLimit, jobsFilter } = get();
    set({ isLoadingJobs: true });
    try {
      const params: Record<string, string> = {
        page: String(jobsPage),
        limit: String(jobsLimit),
      };
      if (jobsFilter === 'mine') {
        const authUser = (await import('@/store/useAuthStore')).useAuthStore.getState().user;
        if (authUser) params.userId = authUser.id;
      }
      const { data } = await axios.get<{ data: VideoJob[]; total: number; page: number; limit: number }>(`${API_URL}/video-jobs`, { params, signal });
      set({ jobs: data.data, jobsTotal: data.total, jobsPage: data.page, isLoadingJobs: false });
    } catch (error) {
      if (!axios.isCancel(error)) {
        set({ isLoadingJobs: false });
      }
    }
  },

  setJobsPage: (page) => {
    set({ jobsPage: page });
    get().loadJobs();
  },

  setJobsFilter: (filter) => {
    set({ jobsFilter: filter, jobsPage: 1 });
    get().loadJobs();
  },

  openJobModal: async (job) => {
    try {
      const { data } = await axios.get<VideoJob>(`${API_URL}/video-jobs/${job.id}`);
      set({ selectedJob: data, isModalOpen: true });
    } catch {
      set({ selectedJob: job, isModalOpen: true });
    }
  },

  closeJobModal: () => set({ isModalOpen: false, selectedJob: null }),

  rerenderJob: async () => {
    const { selectedJob } = get();
    if (!selectedJob) return;
    try {
      await api.post('/video-jobs', {
        raceUrl: selectedJob.raceUrl,
        driverName: selectedJob.driverName,
        offset: selectedJob.offset,
        videoDurationSec: selectedJob.videoDurationSec,
        sourceVideoS3Key: selectedJob.sourceVideoS3Key,
        raceData: selectedJob.raceData,
      });
      set({ isModalOpen: false, selectedJob: null });
      get().loadJobs();
    } catch (error) {
      console.error('Rerender failed', error);
    }
  },

  archiveJob: async () => {
    const { selectedJob } = get();
    if (!selectedJob) return;
    try {
      await api.patch(`/video-jobs/${selectedJob.id}/archive`);
      set({ isModalOpen: false, selectedJob: null });
      get().loadJobs();
    } catch (error) {
      console.error('Archive failed', error);
    }
  },
}));
