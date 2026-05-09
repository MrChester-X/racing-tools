"use client";
import { useState } from "react";
import Modal from "./Modal";
import { useRaceStore } from "../store/useRaceStore";

interface ImportTeamsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ImportTeamsModal({ isOpen, onClose }: ImportTeamsModalProps) {
  const { addTeam } = useRaceStore();
  const [importText, setImportText] = useState("");
  const [parseResult, setParseResult] = useState<{ success: number; failed: string[] } | null>(null);
  const handleImport = () => {
    const lines = importText.trim().split("\n");
    let successCount = 0;
    const failedTeams: string[] = [];
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      const match = trimmedLine.match(/^\d+\.\s*(.+?)\s*-\s*(\d+)$/);
      if (match) {
        const teamName = match[1].trim();
        const kartNumber = match[2].trim();
        const success = addTeam(teamName, kartNumber);
        if (success) {
          successCount++;
        } else {
          failedTeams.push(`${teamName} (карт ${kartNumber})`);
        }
      } else {
        failedTeams.push(trimmedLine);
      }
    }
    setParseResult({ success: successCount, failed: failedTeams });
  };
  const handleClose = () => {
    setImportText("");
    setParseResult(null);
    onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Импорт команд</h2>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Вставьте список команд (формат: "1. Название - Номер")
          </label>
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm" rows={12} placeholder="1. KSC - 14&#10;2. Shepeleff - 2&#10;3. Kuksenko - 12&#10;..." />
        </div>
        {parseResult && (
          <div className={`p-3 rounded-lg ${parseResult.failed.length === 0 ? "bg-green-900/30 border border-green-500/50" : "bg-orange-900/30 border border-orange-500/50"}`}>
            <div className="text-sm">
              <div className="text-green-400 font-medium mb-1">✓ Импортировано: {parseResult.success}</div>
              {parseResult.failed.length > 0 && (
                <div className="text-orange-400">
                  <div className="font-medium mb-1">⚠ Не удалось импортировать: {parseResult.failed.length}</div>
                  <ul className="text-xs space-y-0.5 ml-4 list-disc">
                    {parseResult.failed.slice(0, 5).map((team, idx) => (
                      <li key={idx}>{team}</li>
                    ))}
                    {parseResult.failed.length > 5 && <li>...и ещё {parseResult.failed.length - 5}</li>}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={handleClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">Закрыть</button>
          <button onClick={handleImport} disabled={!importText.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors">Импортировать</button>
        </div>
      </div>
    </Modal>
  );
}

