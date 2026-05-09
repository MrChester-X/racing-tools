"use client";

import { useEffect, useState } from "react";
import { useRaceStore } from "../store/useRaceStore";
import { ParsedRaceTeam } from "../types";
import { Utils } from "../../../utils/Utils";
import RaceTimer from "../components/RaceTimer";

// Цвета для картов (те же что в основном приложении)
const KART_COLORS = ["bg-blue-500", "bg-green-700", "bg-yellow-600", "bg-red-700", "bg-gray-600", "bg-white"];

function getKartColor(kartNumber: string, kartColors: { [kart: string]: number }): string {
  const colorIndex = kartColors[kartNumber] ?? 5;
  return KART_COLORS[colorIndex % KART_COLORS.length];
}

function isWhiteKart(kartNumber: string, kartColors: { [kart: string]: number }): boolean {
  const colorIndex = kartColors[kartNumber] ?? 5;
  return colorIndex === 5; // белый цвет имеет индекс 5
}

export default function FocusMode() {
  const { 
    raceData, 
    pitlane, 
    teams, 
    events, 
    loadInitialData, 
    addEvent, 
    undoLastAction,
    undoHistory,
    getRaceTimer
  } = useRaceStore();
  
  const [selectedKart, setSelectedKart] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  if (!raceData || !pitlane || !teams || !events) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <div className="text-white text-lg font-medium">Загрузка режима волны...</div>
        </div>
      </div>
    );
  }

  const teamsArray = Object.values(teams).sort((a, b) => 
    parseInt(a.startKart) - parseInt(b.startKart)
  );
  const pitlanesCount = raceData.pitlanesCount;
  const kartColors = raceData.kartColors || {};
  const timer = getRaceTimer();

  // Информация о последнем действии для кнопки отмены
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const lastEventTeam = lastEvent && lastEvent.type === "pit" ? teams[lastEvent.kart] : null;

  const handleKartClick = (kart: string) => {
    setSelectedKart(selectedKart === kart ? null : kart);
  };

  const handlePitlaneClick = (laneIndex: number) => {
    if (!selectedKart) return;
    
    // Используем новую сигнатуру: addEvent(eventType, kart, lane, insertIndex, position?, newKart?)
    const success = addEvent("pit", selectedKart, laneIndex, -1);
    if (success) {
      setSelectedKart(null); // Сбрасываем выбор после успешного добавления
    }
  };

  const handleUndo = () => {
    undoLastAction();
  };

  return (
    <div className="min-h-screen bg-black text-white p-4">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">РЕЖИМ ВОЛНЫ</h1>
          <p className="text-gray-400 text-sm">Не проебись пжпжпжпжжп</p>
        </div>
        <div className="flex items-center gap-4">
          <RaceTimer compact />
          <button
            onClick={handleUndo}
            disabled={undoHistory.length === 0}
            className={`px-4 py-2 rounded font-bold text-sm ${
              undoHistory.length > 0
                ? "bg-yellow-600 hover:bg-yellow-700 text-white"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
            }`}
          >
            {undoHistory.length > 0 && lastEvent ? (
              <div className="flex flex-col items-center">
                <div>ОТМЕНИТЬ {lastEvent.kart}</div>
                <div className="text-xs opacity-75">
                  {lastEvent.type === "pit" && lastEventTeam ? lastEventTeam.name :
                   lastEvent.type === "add_kart" ? "Добавление" :
                   lastEvent.type === "remove_kart" ? "Удаление" :
                   lastEvent.type === "breakdown" ? "Поломка" : "Событие"}
                </div>
              </div>
            ) : (
              "ОТМЕНИТЬ"
            )}
          </button>
          <a 
            href="/pits" 
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-bold text-sm"
          >
            ВЫХОД
          </a>
        </div>
      </div>

      {/* Instructions */}
      {selectedKart && (
        <div className="mb-4 p-3 bg-blue-900/50 border border-blue-500 rounded">
          <p className="text-blue-200 font-bold">
            Выбран карт {selectedKart}. Нажмите на питлейн (А или Б) для отправки в питлейн.
          </p>
        </div>
      )}
      
      {!selectedKart && (
        <div className="mb-4 p-3 bg-gray-800/50 border border-gray-600 rounded">
          <p className="text-gray-300">
            Выберите карт команды, затем питлейн куда отправить
          </p>
        </div>
      )}

      {/* Питлейны */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-3">ПИТЛЕЙНЫ</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: pitlanesCount }, (_, index) => {
            const pitlaneLabel = Utils.getLaneLetter(index);
            const queue = pitlane[index] || [];
            
            return (
              <button
                key={index}
                onClick={() => handlePitlaneClick(index)}
                disabled={!selectedKart}
                className={`
                  w-full p-3 rounded-lg border-2 transition-all duration-200
                  ${selectedKart 
                    ? "bg-orange-600 hover:bg-orange-500 border-orange-400 cursor-pointer shadow-lg" 
                    : "bg-gray-800 border-gray-600 cursor-not-allowed"
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <div className="text-left flex-grow">
                    <div className="text-base font-bold">
                      {queue.length === 0 ? (
                        `${pitlaneLabel} ← Пусто`
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{pitlaneLabel}</span>
                          <span className="text-lg text-gray-300">←</span>
                          <div className="flex items-center gap-1">
                            {queue.map((kartNumber, kartIndex) => (
                              <span key={kartIndex} className="flex items-center">
                                <span 
                                  className={`inline-block w-4 h-4 rounded-full mr-1 ${getKartColor(kartNumber, kartColors)}`}
                                ></span>
                                <span className="font-bold text-white">{kartNumber}</span>
                                {kartIndex < queue.length - 1 && <span className="mx-1 text-gray-400">|</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {selectedKart && (
                    <div className="text-xl">→</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Карты команд */}
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4">КАРТЫ</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {teamsArray.map((team: ParsedRaceTeam) => {
            const currentKart = team.karts[team.karts.length - 1];
            const colorClass = getKartColor(currentKart, kartColors);
            const isWhite = isWhiteKart(currentKart, kartColors);
            const isSelected = selectedKart === team.startKart;
            
            return (
              <button
                key={team.startKart}
                onClick={() => handleKartClick(team.startKart)}
                className={`
                  relative p-2 rounded-lg transition-all duration-200 border-2 h-24 min-h-[96px]
                  ${isSelected 
                    ? `${colorClass} border-white shadow-lg ring-2 ring-white/50` 
                    : `${colorClass} border-transparent hover:border-white/50`
                  }
                `}
              >
                <div className="text-center h-full flex flex-col justify-center">
                  <div className={`text-xl font-bold mb-1 leading-none ${isWhite ? 'text-black' : 'text-white'}`}>
                    {team.startKart}
                  </div>
                  <div className={`text-xs font-medium truncate leading-tight mb-1 ${isWhite ? 'text-black/80' : 'text-white/80'}`}>
                    {team.name}
                  </div>
                  <div className={`text-xs leading-none ${isWhite ? 'text-black/60' : 'text-white/60'}`}>
                    Кол-во питов: {team.karts.length - 1}
                  </div>
                </div>
                
                {/* Текущий карт в правом верхнем углу */}
                <div className={`absolute top-1 right-1 text-xs font-bold px-1 py-0.5 rounded border ${
                  isWhite 
                    ? 'bg-white/90 text-black border-black/30' 
                    : 'bg-black/60 text-white border-white/30'
                }`}>
                  {currentKart}
                </div>
                
                {/* Индикатор выбора */}
                {isSelected && (
                  <div className="absolute -top-1 -left-1 w-3 h-3 bg-white rounded-full border border-black"></div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Последние события */}
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">ПОСЛЕДНИЕ СОБЫТИЯ</h2>
        <div className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto">
          {events.length === 0 ? (
            <p className="text-gray-500 text-center py-4">Событий пока нет</p>
          ) : (
            <div className="space-y-2">
              {events.slice(-10).reverse().map((event, index) => {
                const pitlaneLabel = String.fromCharCode(65 + event.lane); // А, Б, В...
                
                let eventDescription = "";
                let eventDetail = "";
                
                if (event.type === "pit" && event.pitCount !== undefined) {
                  eventDescription = `Питлейн ${pitlaneLabel}`;
                  eventDetail = `Питстоп #${event.pitCount}`;
                } else if (event.type === "add_kart") {
                  eventDescription = `+ Питлейн ${pitlaneLabel}`;
                  eventDetail = "Добавлен";
                } else if (event.type === "remove_kart") {
                  eventDescription = `- Питлейн ${pitlaneLabel}`;
                  eventDetail = "Убран";
                } else if (event.type === "breakdown") {
                  eventDescription = `⚠ Поломка на треке`;
                  eventDetail = event.newKart ? `→ ${event.newKart}` : "Поломка";
                } else {
                  eventDescription = `Питлейн ${pitlaneLabel}`;
                  eventDetail = "Событие";
                }
                
                const raceTime = Utils.formatRaceTime(event.timestamp, timer.startTime);
                return (
                  <div key={index} className="flex items-center justify-between py-2 px-3 bg-gray-800 rounded">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded ${getKartColor(event.kart, kartColors)}`}></div>
                      <span className="font-bold">{event.kart}</span>
                      <span className="text-gray-400">→</span>
                      <span>{eventDescription}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {raceTime && <span className="text-sm font-mono text-green-400">{raceTime}</span>}
                      <span className="text-sm text-gray-400">{eventDetail}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 