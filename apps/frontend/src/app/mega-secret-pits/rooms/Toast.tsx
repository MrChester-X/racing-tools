'use client';
import { useEffect } from 'react';
import { useRoomStore } from './useRoomStore';

export function RoomToast() {
  const { takeoverToast, dismissToast } = useRoomStore();

  useEffect(() => {
    if (!takeoverToast) return;
    const timer = setTimeout(dismissToast, 4000);
    return () => clearTimeout(timer);
  }, [takeoverToast, dismissToast]);

  if (!takeoverToast) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[70] bg-orange-500 text-black rounded-lg px-4 py-2 text-sm font-medium shadow-lg">
      {takeoverToast}
    </div>
  );
}
