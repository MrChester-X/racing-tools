"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// SMS-Timing WebSocket data format
interface SMSDriver {
  K: string;   // Kart number
  N: string;   // Name
  P: number;   // Position
  L: number;   // Lap count
  T: number;   // Last lap time (ms)
  B: number;   // Best lap time (ms)
  A: number;   // Average lap time (ms)
  G: string;   // Gap to leader
  R: number;   // Status?
  D: number;   // ID/timestamp?
  LP: number;
  M: number;
}

interface SMSMessage {
  T: number;
  D: SMSDriver[];
  N: string;   // Session name
  C: number;
  E: number;
  R: number;
  L: number;
  S: number;
  CE: number;
  CS: number;
  EM: number;
}

interface LapRecord {
  kart: string;
  name: string;
  lap: number;
  time: number;      // ms
  position: number;
  timestamp: number;  // when we received it
}

function formatLapTime(ms: number): string {
  if (!ms || ms <= 0) return "-";
  const seconds = ms / 1000;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}:${secs.toFixed(3).padStart(6, "0")}`;
  return secs.toFixed(3);
}

const WS_URL = "wss://webserver8.sms-timing.com:10015/";
const INIT_MSG = "START 25506@pitstoppremium";

export default function LiveTiming() {
  const [drivers, setDrivers] = useState<SMSDriver[]>([]);
  const [sessionName, setSessionName] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [laps, setLaps] = useState<LapRecord[]>([]);
  const [msgCount, setMsgCount] = useState(0);
  const [rawMessages, setRawMessages] = useState<string[]>([]);
  const [showRaw, setShowRaw] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const prevDriversRef = useRef<Map<string, { lap: number; time: number }>>(new Map());

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setError(null);
    setConnected(false);

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      ws.send(INIT_MSG);
    };

    ws.onmessage = (event) => {
      const raw = event.data as string;
      setMsgCount((prev) => prev + 1);
      setRawMessages((prev) => [raw, ...prev].slice(0, 50));

      // Try to parse JSON (some messages might not be JSON)
      if (!raw.startsWith("{")) return;

      try {
        const msg: SMSMessage = JSON.parse(raw);
        if (!msg.D) return;

        setDrivers(msg.D.sort((a, b) => a.P - b.P));
        if (msg.N) setSessionName(msg.N);

        // Detect new laps
        const now = Date.now();
        const prev = prevDriversRef.current;
        const newLaps: LapRecord[] = [];

        for (const d of msg.D) {
          const key = d.K;
          const old = prev.get(key);
          if (old && d.L > old.lap && d.T > 0) {
            newLaps.push({
              kart: d.K,
              name: d.N,
              lap: d.L,
              time: d.T,
              position: d.P,
              timestamp: now,
            });
          }
          prev.set(key, { lap: d.L, time: d.T });
        }

        if (newLaps.length > 0) {
          setLaps((prev) => [...newLaps, ...prev].slice(0, 500));
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      setError("Ошибка соединения");
    };

    ws.onclose = () => {
      setConnected(false);
    };
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">SMS-Timing Live</h1>
          {sessionName && <p className="text-gray-400 text-sm">{sessionName}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-xs text-gray-400">{connected ? "Online" : "Offline"}</span>
          <span className="text-xs text-gray-600">({msgCount} msg)</span>
          {!connected ? (
            <button onClick={connect} className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm font-bold">
              Подключиться
            </button>
          ) : (
            <button onClick={disconnect} className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm font-bold">
              Отключиться
            </button>
          )}
          <a href="/pits" className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm font-bold">
            Назад
          </a>
        </div>
      </div>

      {error && <div className="mb-4 p-2 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">{error}</div>}

      {/* Live standings */}
      {drivers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Позиции</h2>
          <div className="bg-gray-900 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-gray-800">
                  <th className="px-2 py-1.5 text-left">P</th>
                  <th className="px-2 py-1.5 text-left">Карт</th>
                  <th className="px-2 py-1.5 text-left">Имя</th>
                  <th className="px-2 py-1.5 text-right">Круг</th>
                  <th className="px-2 py-1.5 text-right">Посл.</th>
                  <th className="px-2 py-1.5 text-right">Лучш.</th>
                  <th className="px-2 py-1.5 text-right">Средн.</th>
                  <th className="px-2 py-1.5 text-right">Отст.</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.K} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                    <td className="px-2 py-1.5 font-bold text-yellow-400">{d.P}</td>
                    <td className="px-2 py-1.5 font-bold">{d.K}</td>
                    <td className="px-2 py-1.5 truncate max-w-[150px]">{d.N}</td>
                    <td className="px-2 py-1.5 text-right text-gray-300">{d.L}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatLapTime(d.T)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-green-400">{formatLapTime(d.B)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-gray-400">{formatLapTime(d.A)}</td>
                    <td className="px-2 py-1.5 text-right text-gray-400">{d.G || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lap history */}
      {laps.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Круги ({laps.length})</h2>
          <div className="bg-gray-900 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="text-gray-500 text-xs border-b border-gray-800">
                  <th className="px-2 py-1.5 text-left">Карт</th>
                  <th className="px-2 py-1.5 text-left">Имя</th>
                  <th className="px-2 py-1.5 text-right">Круг #</th>
                  <th className="px-2 py-1.5 text-right">Время</th>
                  <th className="px-2 py-1.5 text-right">Поз.</th>
                </tr>
              </thead>
              <tbody>
                {laps.map((lap, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    <td className="px-2 py-1 font-bold">{lap.kart}</td>
                    <td className="px-2 py-1 truncate max-w-[150px] text-gray-300">{lap.name}</td>
                    <td className="px-2 py-1 text-right text-gray-400">{lap.lap}</td>
                    <td className="px-2 py-1 text-right font-mono">{formatLapTime(lap.time)}</td>
                    <td className="px-2 py-1 text-right text-yellow-400">{lap.position}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Raw messages toggle */}
      <div>
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="text-xs text-gray-600 hover:text-gray-400 mb-2"
        >
          {showRaw ? "Скрыть" : "Показать"} сырые сообщения ({rawMessages.length})
        </button>
        {showRaw && (
          <div className="bg-gray-900 rounded-lg p-2 max-h-64 overflow-y-auto">
            {rawMessages.map((msg, i) => (
              <pre key={i} className="text-[10px] text-gray-500 border-b border-gray-800/50 py-1 whitespace-pre-wrap break-all">
                {msg.length > 500 ? msg.slice(0, 500) + "..." : msg}
              </pre>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
