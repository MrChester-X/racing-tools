'use client';
import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { mergeKartodromOptions } from '@/lib/kartodrom';
import { HeatItem } from '../types';

interface HeatsState {
  heats: HeatItem[];
  heatsTotal: number;
  heatsPage: number;
  heatsLimit: number;
  kartodromId: string;
  kartodromOptions: string[];
  isLoading: boolean;
  channel: RealtimeChannel | null;

  setKartodromId: (id: string) => void;
  setHeatsPage: (page: number) => void;
  loadHeats: () => Promise<void>;
  loadKartodroms: () => Promise<void>;
  subscribe: () => void;
  unsubscribe: () => void;
}

export const useHeatsStore = create<HeatsState>((set, get) => ({
  heats: [],
  heatsTotal: 0,
  heatsPage: 1,
  heatsLimit: 20,
  kartodromId: 'pitstop-premium',
  kartodromOptions: [],
  isLoading: false,
  channel: null,

  setKartodromId: (kartodromId: string) => {
    set({ kartodromId, heatsPage: 1 });
    get().loadHeats();
    get().subscribe();
  },

  setHeatsPage: (page: number) => {
    set({ heatsPage: page });
    get().loadHeats();
  },

  loadHeats: async () => {
    const { heatsPage, heatsLimit, kartodromId } = get();
    set({ isLoading: true });
    try {
      const from = (heatsPage - 1) * heatsLimit;
      const to = from + heatsLimit - 1;
      const { data, count, error } = await supabase
        .from('heats')
        .select('*', { count: 'exact' })
        .eq('kartodromId', kartodromId)
        .order('createdAt', { ascending: false })
        .range(from, to);

      if (error) throw error;
      set({ heats: (data ?? []) as HeatItem[], heatsTotal: count ?? 0 });
    } finally {
      set({ isLoading: false });
    }
  },

  loadKartodroms: async () => {
    const { data, error } = await supabase.from('heats').select('kartodromId');
    if (error) throw error;
    const fromDb = Array.from(
      new Set((data ?? []).map((r: { kartodromId: string }) => r.kartodromId)),
    );
    const unique = mergeKartodromOptions(fromDb);
    const current = get().kartodromId;
    const next = unique.includes(current) ? current : unique[0];
    set({ kartodromOptions: unique, kartodromId: next });
  },

  subscribe: () => {
    const { channel: prev, kartodromId } = get();
    if (prev) supabase.removeChannel(prev);

    const channel = supabase
      .channel(`heats:${kartodromId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'heats',
          filter: `kartodromId=eq.${kartodromId}`,
        },
        () => {
          get().loadHeats();
        },
      )
      .subscribe();

    set({ channel });
  },

  unsubscribe: () => {
    const { channel } = get();
    if (channel) {
      supabase.removeChannel(channel);
      set({ channel: null });
    }
  },
}));
