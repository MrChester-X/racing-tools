"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { RaceSettings } from "../types";

interface RaceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: RaceSettings) => void;
  currentSettings?: RaceSettings;
}

export default function RaceSettingsModal({
  isOpen,
  onClose,
  onSave,
  currentSettings,
}: RaceSettingsModalProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [raceName, setRaceName] = useState(currentSettings?.raceName || "");
  const [pitlanesCount, setPitlanesCount] = useState(currentSettings?.pitlanesCount || 2);
  const [startPitlane, setStartPitlane] = useState<string[][]>(
    currentSettings?.startPitlane || [[], []]
  );
  const [raceComments, setRaceComments] = useState(currentSettings?.raceComments || "");
  const [maxLapTimeInput, setMaxLapTimeInput] = useState(
    currentSettings?.maxLapTimeForAverageSec != null
      ? String(currentSettings.maxLapTimeForAverageSec)
      : "",
  );
  const [minLapTimeInput, setMinLapTimeInput] = useState(
    currentSettings?.minLapTimeSec != null
      ? String(currentSettings.minLapTimeSec)
      : "",
  );
  const [excludeLapAfterLong, setExcludeLapAfterLong] = useState(
    !!currentSettings?.excludeLapAfterLong,
  );
  const [excludeFirstLapAfterPit, setExcludeFirstLapAfterPit] = useState(
    !!currentSettings?.excludeFirstLapAfterPit,
  );
  const [excludeAfterMissingLap, setExcludeAfterMissingLap] = useState(
    !!currentSettings?.excludeAfterMissingLap,
  );

  // Обработка анимации модалки
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(onClose, 300);
  };

  // Обновляем состояние при изменении текущих настроек
  useEffect(() => {
    if (currentSettings) {
      setRaceName(currentSettings.raceName || "");
      setPitlanesCount(currentSettings.pitlanesCount);
      setStartPitlane(currentSettings.startPitlane);
      setRaceComments(currentSettings.raceComments || "");
      setMaxLapTimeInput(
        currentSettings.maxLapTimeForAverageSec != null
          ? String(currentSettings.maxLapTimeForAverageSec)
          : "",
      );
      setMinLapTimeInput(
        currentSettings.minLapTimeSec != null
          ? String(currentSettings.minLapTimeSec)
          : "",
      );
      setExcludeLapAfterLong(!!currentSettings.excludeLapAfterLong);
      setExcludeFirstLapAfterPit(!!currentSettings.excludeFirstLapAfterPit);
      setExcludeAfterMissingLap(!!currentSettings.excludeAfterMissingLap);
    }
  }, [currentSettings]);

  // Обновляем количество питлейнов
  const handlePitlanesCountChange = (newCount: number) => {
    if (newCount < 1) return;
    
    setPitlanesCount(newCount);
    
    // Обновляем массив питлейнов
    const newStartPitlane = [...startPitlane];
    
    if (newCount > startPitlane.length) {
      // Добавляем новые питлейны
      for (let i = startPitlane.length; i < newCount; i++) {
        newStartPitlane.push([]);
      }
    } else if (newCount < startPitlane.length) {
      // Удаляем лишние питлейны
      newStartPitlane.splice(newCount);
    }
    
    setStartPitlane(newStartPitlane);
  };

  // Добавляем карт в питлейн
  const addKartToPitlane = (laneIndex: number, kart: string) => {
    if (!kart.trim()) return;
    
    const newStartPitlane = [...startPitlane];
    newStartPitlane[laneIndex] = [...newStartPitlane[laneIndex], kart.trim()];
    setStartPitlane(newStartPitlane);
  };

  // Удаляем карт из питлейна
  const removeKartFromPitlane = (laneIndex: number, kartIndex: number) => {
    const newStartPitlane = [...startPitlane];
    newStartPitlane[laneIndex] = newStartPitlane[laneIndex].filter((_, index) => index !== kartIndex);
    setStartPitlane(newStartPitlane);
  };

  // Перемещаем карт вверх/вниз в питлейне
  const moveKart = (laneIndex: number, kartIndex: number, direction: 'up' | 'down') => {
    const newStartPitlane = [...startPitlane];
    const lane = [...newStartPitlane[laneIndex]];
    
    const newIndex = direction === 'up' ? kartIndex - 1 : kartIndex + 1;
    
    if (newIndex >= 0 && newIndex < lane.length) {
      [lane[kartIndex], lane[newIndex]] = [lane[newIndex], lane[kartIndex]];
      newStartPitlane[laneIndex] = lane;
      setStartPitlane(newStartPitlane);
    }
  };

  const handleSave = () => {
    const parsedMax = parseFloat(maxLapTimeInput.replace(",", "."));
    const parsedMin = parseFloat(minLapTimeInput.replace(",", "."));
    const settings: RaceSettings = {
      raceName: raceName.trim() || undefined,
      pitlanesCount,
      startPitlane,
      raceComments: raceComments.trim() || undefined,
      maxLapTimeForAverageSec:
        Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : undefined,
      minLapTimeSec:
        Number.isFinite(parsedMin) && parsedMin > 0 ? parsedMin : undefined,
      excludeLapAfterLong: excludeLapAfterLong || undefined,
      excludeFirstLapAfterPit: excludeFirstLapAfterPit || undefined,
      excludeAfterMissingLap: excludeAfterMissingLap || undefined,
    };

    onSave(settings);
    onClose();
  };

  if (!shouldRender) return null;

  return createPortal(
    <div 
      className={`fixed inset-0 bg-black flex items-center justify-center z-[9999] transition-opacity duration-300 ease-out p-4 ${
        isAnimating ? 'bg-opacity-80' : 'bg-opacity-0'
      }`}
      onClick={handleClose}
    >
      <div 
        className={`bg-gray-800 rounded-xl w-full max-w-4xl shadow-2xl border border-gray-700 transition-all duration-300 ease-out max-h-[90vh] flex flex-col ${
          isAnimating 
            ? 'transform scale-100 opacity-100' 
            : 'transform scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Настройки гонки</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
        {/* Название заезда */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
            Название заезда (опционально)
          </label>
          <input
            type="text"
            value={raceName}
            onChange={(e) => setRaceName(e.target.value)}
            placeholder="Введите название заезда..."
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>

        {/* Количество питлейнов */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
            Количество питлейнов
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handlePitlanesCountChange(pitlanesCount - 1)}
              disabled={pitlanesCount <= 1}
              className="w-8 h-8 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded flex items-center justify-center font-bold"
            >
              -
            </button>
            <span className="text-white font-medium min-w-[2rem] text-center">
              {pitlanesCount}
            </span>
            <button
              onClick={() => handlePitlanesCountChange(pitlanesCount + 1)}
              className="w-8 h-8 bg-green-600 hover:bg-green-700 text-white rounded flex items-center justify-center font-bold"
            >
              +
            </button>
          </div>
        </div>

        {/* Стартовые карты в питлейнах */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-3">
            Стартовые карты в питлейнах
          </label>
          <div className="space-y-4">
            {startPitlane.map((lane, laneIndex) => (
              <PitlaneEditor
                key={laneIndex}
                laneIndex={laneIndex}
                karts={lane}
                onAddKart={(kart) => addKartToPitlane(laneIndex, kart)}
                onRemoveKart={(kartIndex) => removeKartFromPitlane(laneIndex, kartIndex)}
                onMoveKart={(kartIndex, direction) => moveKart(laneIndex, kartIndex, direction)}
              />
            ))}
          </div>
        </div>

        {/* Комментарии */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
            Комментарии к гонке
          </label>
          <textarea
            value={raceComments}
            onChange={(e) => setRaceComments(e.target.value)}
            placeholder="Минимальный стинт, максимальный стинт, количество кругов и т.д..."
            rows={4}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-vertical"
          />
        </div>

        {/* Максимальное время круга для среднего */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
            Макс. время круга для среднего (сек)
            <span className="text-gray-500 font-normal"> — опционально</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={maxLapTimeInput}
            onChange={(e) => setMaxLapTimeInput(e.target.value)}
            placeholder="например, 65"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <div className="text-xs text-gray-400 mt-1">
            Круги длительностью больше этого значения не учитываются в среднем (pit-out, заезды в бокс и т.п.). Пусто = учитывать все круги.
          </div>
        </div>

        {/* Минимальное время круга */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
            Мин. время круга (сек)
            <span className="text-gray-500 font-normal"> — опционально</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={minLapTimeInput}
            onChange={(e) => setMinLapTimeInput(e.target.value)}
            placeholder="например, 30"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <div className="text-xs text-gray-400 mt-1">
            Круги короче этого значения не учитываются нигде: ни в бесте, ни в среднем, ни в статистике стинтов. Пусто = учитывать все круги.
          </div>
        </div>

        {/* Чекбокс: исключать круг после долгого */}
        <div className="flex items-start gap-3">
          <input
            id="excludeLapAfterLong"
            type="checkbox"
            checked={excludeLapAfterLong}
            onChange={(e) => setExcludeLapAfterLong(e.target.checked)}
            className="mt-1 w-4 h-4 accent-orange-500 cursor-pointer"
          />
          <label htmlFor="excludeLapAfterLong" className="flex-1 cursor-pointer">
            <div className="text-sm font-medium text-gray-200">
              Исключать круг после слишком долгого
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              Если предыдущий круг был дольше «макс. времени круга для среднего», следующий не учитывается нигде (ни в бесте, ни в среднем).
            </div>
          </label>
        </div>

        {/* Чекбокс: исключать первый круг после питов */}
        <div className="flex items-start gap-3">
          <input
            id="excludeFirstLapAfterPit"
            type="checkbox"
            checked={excludeFirstLapAfterPit}
            onChange={(e) => setExcludeFirstLapAfterPit(e.target.checked)}
            className="mt-1 w-4 h-4 accent-orange-500 cursor-pointer"
          />
          <label htmlFor="excludeFirstLapAfterPit" className="flex-1 cursor-pointer">
            <div className="text-sm font-medium text-gray-200">
              Исключать первый круг после пита
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              Out-lap (pit.lapNumber + 1) не учитывается ни в бесте, ни в среднем, ни в статистике стинтов.
            </div>
          </label>
        </div>

        {/* Чекбокс: исключать круг, если предыдущий пустой */}
        <div className="flex items-start gap-3">
          <input
            id="excludeAfterMissingLap"
            type="checkbox"
            checked={excludeAfterMissingLap}
            onChange={(e) => setExcludeAfterMissingLap(e.target.checked)}
            className="mt-1 w-4 h-4 accent-orange-500 cursor-pointer"
          />
          <label htmlFor="excludeAfterMissingLap" className="flex-1 cursor-pointer">
            <div className="text-sm font-medium text-gray-200">
              Исключать круг, если предыдущий пропал
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              Если предыдущего круга (lapCount − 1) нет в данных — текущий не учитывается. Также исключает самый первый круг карта.
            </div>
          </label>
        </div>

          </div>
        </div>

        {/* Footer with buttons */}
        <div className="p-6 border-t border-gray-700">
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors duration-200"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md transition-colors duration-200"
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Компонент для редактирования одного питлейна
interface PitlaneEditorProps {
  laneIndex: number;
  karts: string[];
  onAddKart: (kart: string) => void;
  onRemoveKart: (kartIndex: number) => void;
  onMoveKart: (kartIndex: number, direction: 'up' | 'down') => void;
}

function PitlaneEditor({ laneIndex, karts, onAddKart, onRemoveKart, onMoveKart }: PitlaneEditorProps) {
  const [newKart, setNewKart] = useState("");

  const handleAddKart = () => {
    if (newKart.trim()) {
      onAddKart(newKart);
      setNewKart("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddKart();
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h4 className="text-sm font-medium text-gray-200 mb-3">
        Питлейн {laneIndex + 1}
      </h4>
      
      {/* Список картов */}
      <div className="space-y-2 mb-3">
        {karts.map((kart, kartIndex) => (
          <div
            key={kartIndex}
            className="flex items-center gap-2 bg-gray-700 rounded px-3 py-2"
          >
            <span className="flex-1 text-white">{kart}</span>
            
            {/* Кнопки перемещения */}
            <button
              onClick={() => onMoveKart(kartIndex, 'up')}
              disabled={kartIndex === 0}
              className="w-6 h-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-xs flex items-center justify-center"
              title="Переместить вверх"
            >
              ↑
            </button>
            <button
              onClick={() => onMoveKart(kartIndex, 'down')}
              disabled={kartIndex === karts.length - 1}
              className="w-6 h-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-xs flex items-center justify-center"
              title="Переместить вниз"
            >
              ↓
            </button>
            
            {/* Кнопка удаления */}
            <button
              onClick={() => onRemoveKart(kartIndex)}
              className="w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded text-xs flex items-center justify-center"
              title="Удалить карт"
            >
              ×
            </button>
          </div>
        ))}
        
        {karts.length === 0 && (
          <div className="text-gray-400 text-sm italic text-center py-2">
            Карты не добавлены
          </div>
        )}
      </div>

      {/* Добавление нового карта */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newKart}
          onChange={(e) => setNewKart(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Номер карта..."
          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
        />
        <button
          onClick={handleAddKart}
          className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors duration-200"
        >
          Добавить
        </button>
      </div>
    </div>
  );
}