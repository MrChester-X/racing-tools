"use client";

import { useEffect, useState } from "react";
import { PdfReport } from "../components/PdfReport";
import { ParsedRaceEvent, ParsedRaceTeam, RaceData } from "../types";
import { LapItem } from "@/app/heats/types";
import { generatePdf } from "./pdfGenerator";
import { downloadMarkdown } from "./markdownGenerator";

interface ExportData {
  teams: Record<string, ParsedRaceTeam>;
  events: ParsedRaceEvent[];
  raceData: RaceData;
  pitlane: string[][];
  linkedHeat: { id: string; name: string } | null;
  linkedLapsByKart: Record<string, LapItem[]> | null;
}

export default function PDFExportPage() {
  const [data, setData] = useState<ExportData | null>(null);

  useEffect(() => {
    // Получаем данные из localStorage
    const savedData = localStorage.getItem("pdf-export-data");
    if (savedData) {
      setData(JSON.parse(savedData));
    }
  }, []);

  const handleExportPDF = async () => {
    if (!data) return;
    const filename = `karting_report_${new Date().toISOString().slice(0, 10)}_${Math.floor(Date.now() / 1000)}.pdf`;
    await generatePdf(data, filename);
  };

  const handleExportMarkdown = () => {
    if (!data) return;
    const filename = `karting_report_${new Date().toISOString().slice(0, 10)}_${Math.floor(Date.now() / 1000)}.md`;
    downloadMarkdown(data, filename);
  };

  const handleBack = () => {
    window.close();
    window.history.back();
  };

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <div className="text-gray-700 text-lg font-medium">Загрузка данных для PDF...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Панель управления */}
      <div className="bg-white shadow-sm border-b border-gray-200 p-4 print:hidden">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">PDF Export Preview</h1>
          <div className="flex gap-3">
            <button onClick={handleBack} className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors">
              ← Назад
            </button>
            <button onClick={handleExportMarkdown} className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-md transition-colors">
              📝 Markdown
            </button>
            <button onClick={handleExportPDF} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors">
              📄 Скачать PDF
            </button>
          </div>
        </div>
      </div>

      {/* Контент для PDF */}
      <div className="max-w-4xl mx-auto p-6">
        <div id="pdf-content">
          <PdfReport
            teams={data.teams}
            events={data.events}
            raceData={data.raceData}
            pitlane={data.pitlane}
            linkedHeat={data.linkedHeat ?? null}
            linkedLapsByKart={data.linkedLapsByKart ?? null}
          />
        </div>
      </div>
    </div>
  );
}
