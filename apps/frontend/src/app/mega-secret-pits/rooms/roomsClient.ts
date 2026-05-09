import { supabase } from '@/lib/supabase';
import { PitRoom } from './types';

export async function listRooms(): Promise<PitRoom[]> {
  const { data, error } = await supabase
    .from('pit_rooms')
    .select('*')
    .order('updatedAt', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as PitRoom[];
}

export async function loadRoom(id: string): Promise<PitRoom | null> {
  const { data, error } = await supabase
    .from('pit_rooms')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as PitRoom | null) ?? null;
}

export async function createRoom(params: {
  name: string;
  ownerSessionId: string;
  ownerNickname: string;
  data: unknown;
}): Promise<PitRoom> {
  const { data, error } = await supabase
    .from('pit_rooms')
    .insert({
      name: params.name,
      ownerSessionId: params.ownerSessionId,
      ownerNickname: params.ownerNickname,
      data: params.data,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as PitRoom;
}

export async function persistRoomData(id: string, data: unknown): Promise<void> {
  const { error } = await supabase
    .from('pit_rooms')
    .update({ data, updatedAt: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function claimOwnership(id: string, sessionId: string, nickname: string): Promise<void> {
  const { error } = await supabase
    .from('pit_rooms')
    .update({
      ownerSessionId: sessionId,
      ownerNickname: nickname,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}
