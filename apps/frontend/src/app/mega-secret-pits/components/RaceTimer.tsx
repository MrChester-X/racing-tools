"use client";
import { useEffect, useState } from "react";
import { useRaceStore } from "../store/useRaceStore";

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

interface RaceTimerProps {
  compact?: boolean;
}

export default function RaceTimer({ compact = false }: RaceTimerProps) {
  const { getRaceTimer, startRace, stopRace, resetRaceTimer } = useRaceStore();
  const timer = getRaceTimer();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!timer.isRunning || !timer.startTime) {
      if (timer.startTime && timer.endTime) {
        setElapsed(timer.endTime - timer.startTime);
      } else {
        setElapsed(0);
      }
      return;
    }
    const updateElapsed = () => setElapsed(Date.now() - timer.startTime!);
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [timer.isRunning, timer.startTime, timer.endTime]);
  const handleStart = () => startRace();
  const handleStop = () => stopRace();
  const handleReset = () => {
    if (window.confirm("Сбросить таймер гонки?")) resetRaceTimer();
  };
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={`font-mono text-lg font-bold ${timer.isRunning ? "text-green-400" : timer.endTime ? "text-orange-400" : "text-gray-400"}`}>
          {formatTime(elapsed)}
        </div>
        {!timer.isRunning && !timer.startTime && (
          <button onClick={handleStart} className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold">▶ Старт</button>
        )}
        {timer.isRunning && (
          <button onClick={handleStop} className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold">⏹ Стоп</button>
        )}
        {!timer.isRunning && timer.startTime && (
          <button onClick={handleReset} className="px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-xs font-bold">↺</button>
        )}
      </div>
    );
  }
  return (
    <div className="bg-black/30 backdrop-blur-sm border border-white/20 rounded-lg p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${timer.isRunning ? "bg-green-500 animate-pulse" : timer.endTime ? "bg-orange-500" : "bg-gray-500"}`} />
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wider">
              {timer.isRunning ? "Гонка идёт" : timer.endTime ? "Гонка завершена" : "Гонка не начата"}
            </div>
            <div className={`font-mono text-2xl font-bold ${timer.isRunning ? "text-green-400" : timer.endTime ? "text-orange-400" : "text-gray-400"}`}>
              {formatTime(elapsed)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!timer.isRunning && !timer.startTime && (
            <button onClick={handleStart} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-bold transition-colors">▶ Старт гонки</button>
          )}
          {timer.isRunning && (
            <button onClick={handleStop} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-bold transition-colors">⏹ Завершить</button>
          )}
          {!timer.isRunning && timer.startTime && (
            <>
              <button onClick={handleStart} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-bold transition-colors">▶ Продолжить</button>
              <button onClick={handleReset} className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md text-sm transition-colors" title="Сбросить">↺</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

