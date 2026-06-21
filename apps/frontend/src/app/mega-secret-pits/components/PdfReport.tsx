"use client";

import React from "react";
import { KartStint, ParsedRaceEvent, ParsedRaceTeam, RaceData, RaceSettings } from "../types";
import { LapItem } from "@/app/heats/types";
import { buildLapFilterContext, computeExcludedLapCounts } from "../lapFilters";

interface PdfReportProps {
  teams: Record<string, ParsedRaceTeam>;
  events: ParsedRaceEvent[];
  raceData: RaceData;
  pitlane: string[][];
  linkedHeat: { id: string; name: string } | null;
  linkedLapsByKart: Record<string, LapItem[]> | null;
}

type StintStats =
  | { kind: "ok"; count: number; avg: number | null; avgCount: number; best: number; driver: string | null }
  | { kind: "missing-lap-numbers" }
  | { kind: "no-data" };

function formatLapTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(3);
  return min > 0 ? `${min}:${sec.padStart(6, "0")}` : sec;
}

function computeStintStats(
  startKart: string,
  stint: KartStint,
  events: ParsedRaceEvent[],
  linkedLapsForTeam: LapItem[] | undefined,
  settings: RaceSettings | undefined,
): StintStats {
  if (!linkedLapsForTeam || linkedLapsForTeam.length === 0) return { kind: "no-data" };
  if (stint.startLap === null || stint.unbounded) return { kind: "missing-lap-numbers" };

  const startLap = stint.startLap;
  const endLap = stint.endLap ?? Infinity;
  const teamPits = events.filter(
    (e) => e.type === "pit" && e.team?.startKart === startKart,
  );

  const ctx = buildLapFilterContext(settings);
  const excluded = computeExcludedLapCounts(linkedLapsForTeam, teamPits, ctx);
  const laps = linkedLapsForTeam.filter(
    (l) => l.lapCount >= startLap && l.lapCount <= endLap && !excluded.has(l.lapCount),
  );
  if (laps.length === 0) return { kind: "no-data" };

  const maxLapTimeForAverageSec = settings?.maxLapTimeForAverageSec;
  const maxMs =
    typeof maxLapTimeForAverageSec === "number" && maxLapTimeForAverageSec > 0
      ? maxLapTimeForAverageSec * 1000
      : Infinity;

  let sum = 0;
  let avgCount = 0;
  let best = Infinity;
  for (const l of laps) {
    if (l.time < best) best = l.time;
    if (l.time <= maxMs) {
      sum += l.time;
      avgCount++;
    }
  }
  const avg = avgCount > 0 ? sum / avgCount : null;

  // Имя пилота — берём из первого (самого раннего) круга стинта.
  const firstLap = laps.reduce((acc, l) => (l.lapCount < acc.lapCount ? l : acc), laps[0]);
  const rawDriver = (firstLap.meta as { stint?: { driver?: string } } | undefined)?.stint?.driver;
  const driver = typeof rawDriver === "string" && rawDriver.trim() ? rawDriver.trim() : null;

  return { kind: "ok", count: laps.length, avg, avgCount, best, driver };
}

export const PdfReport: React.FC<PdfReportProps> = ({
  teams,
  events,
  raceData,
  pitlane,
  linkedHeat,
  linkedLapsByKart,
}) => {
  // Все уникальные карты (из сегментов — включая сломанные, которых уже нет в team.karts)
  const allKarts = new Set<string>();
  Object.values(teams).forEach((team) => {
    team.kartStints.forEach((seg) => allKarts.add(seg.kart));
  });
  const sortedKarts = Array.from(allKarts).sort((a, b) => parseInt(a) - parseInt(b));

  // Какие карты сейчас в питах
  const kartsInPits = new Set<string>();
  if (pitlane) {
    pitlane.forEach((lane) => {
      lane.forEach((kart) => {
        kartsInPits.add(kart);
      });
    });
  }


  // Хронологическая история использования карта
  const getKartHistory = (kartNumber: string) => {
    interface KartUsagePeriod {
      teamName: string;
      startKart: string;
      stintNumber: number;
      isStarting: boolean;
      isCurrent: boolean;
      stats: StintStats | null;
      startTime?: number;
    }

    const kartUsageHistory: KartUsagePeriod[] = [];

    let earliestTs: number | undefined;
    for (const e of events) {
      if (e.timestamp !== undefined && (earliestTs === undefined || e.timestamp < earliestTs)) earliestTs = e.timestamp;
    }

    Object.values(teams).forEach((team) => {
      if (!team.kartStints.some((s) => s.kart === kartNumber)) return;
      // Boundary events (pits + breakdowns) in order map 1:1 to segments after the
      // first — segment i (i ≥ 1) was opened by boundary[i-1].
      const boundary = events.filter(
        (e) => (e.type === "pit" || e.type === "breakdown") && e.team?.startKart === team.startKart,
      );
      const lastIndex = team.kartStints.length - 1;
      team.kartStints.forEach((seg, stintIndex) => {
        if (seg.kart !== kartNumber) return;
        const stintNumber = stintIndex + 1;
        const isStarting = stintIndex === 0;
        const isCurrent = stintIndex === lastIndex;
        const startTime = stintIndex > 0 ? boundary[stintIndex - 1]?.timestamp : earliestTs;

        const stats = linkedHeat && linkedLapsByKart
          ? computeStintStats(team.startKart, seg, events, linkedLapsByKart[team.startKart], raceData.settings)
          : null;

        kartUsageHistory.push({
          teamName: team.name,
          startKart: team.startKart,
          stintNumber,
          isStarting,
          isCurrent,
          stats,
          startTime,
        });
      });
    });

    kartUsageHistory.sort((a, b) => {
      if (a.startTime && b.startTime) return a.startTime - b.startTime;
      if (a.startTime && !b.startTime) return 1;
      if (!a.startTime && b.startTime) return -1;
      return a.stintNumber - b.stintNumber;
    });

    return kartUsageHistory;
  };

  // Суммарные best и best avg по карту (минимум среди stats стинтов)
  const getKartSummary = (history: ReturnType<typeof getKartHistory>) => {
    let best = Infinity;
    let bestAvg = Infinity;
    for (const p of history) {
      if (p.stats && p.stats.kind === "ok") {
        if (p.stats.best < best) best = p.stats.best;
        if (p.stats.avg !== null && p.stats.avg < bestAvg) bestAvg = p.stats.avg;
      }
    }
    return {
      best: best === Infinity ? null : best,
      bestAvg: bestAvg === Infinity ? null : bestAvg,
    };
  };

  const now = new Date();
  const pitEvents = events ? events.filter((e) => e.type === "pit" || !e.type) : [];

  return (
    <div
      style={{
        backgroundColor: "white",
        color: "black",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "12px",
        lineHeight: "1.2",
        width: "754px",
        padding: "20px",
        margin: 0,
      }}
    >
      {/* Заголовок */}
      <div style={{ marginBottom: "20px", borderBottom: "2px solid #d1d5db", paddingBottom: "10px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: "0 0 8px 0" }}>Race Report</h1>
        <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
          Export time:{" "}
          {now.toLocaleString("ru-RU", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </p>
      </div>

      {/* Информация по каждому карту */}
      <div style={{ marginTop: "20px" }}>
        {sortedKarts.map((kartNumber, kartIndex) => {
          const kartHistory = getKartHistory(kartNumber);
          const isInPits = kartsInPits.has(kartNumber);
          const summary = getKartSummary(kartHistory);

          return (
            <div
              key={kartNumber}
              className="pdf-avoid-break"
              style={{
                marginBottom: kartIndex < sortedKarts.length - 1 ? "24px" : "0",
                pageBreakInside: "avoid",
                breakInside: "avoid",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: "#f3f4f6",
                  padding: "8px",
                  borderRadius: "4px",
                  margin: "0 0 12px 0",
                  gap: "12px",
                }}
              >
                <h2 style={{ fontSize: "18px", fontWeight: "bold", margin: 0 }}>
                  Kart #{kartNumber.padStart(2, "0")}
                  {isInPits && <span style={{ color: "#dc2626", marginLeft: "8px" }}>(IN PITS)</span>}
                </h2>
                {linkedHeat && (summary.best !== null || summary.bestAvg !== null) && (
                  <div style={{ fontSize: "11px", fontFamily: "monospace", color: "#374151" }}>
                    <span style={{ color: "#0891b2" }}>🔗</span> Best:{" "}
                    <span style={{ fontWeight: "bold" }}>
                      {summary.best !== null ? formatLapTime(summary.best) : "—"}
                    </span>{" "}
                    · Best avg:{" "}
                    <span style={{ fontWeight: "bold" }}>
                      {summary.bestAvg !== null ? formatLapTime(summary.bestAvg) : "—"}
                    </span>
                  </div>
                )}
              </div>

              {kartHistory.length === 0 ? (
                <p style={{ color: "#6b7280", marginLeft: "16px" }}>No teams found</p>
              ) : (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    border: "1px solid #d1d5db",
                    fontSize: "10px",
                    tableLayout: "fixed",
                  }}
                >
                  <thead>
                    <tr style={{ backgroundColor: "#f3f4f6" }}>
                      <th style={{ border: "1px solid #d1d5db", padding: "4px", textAlign: "left", width: "7%" }}>#</th>
                      <th style={{ border: "1px solid #d1d5db", padding: "4px", textAlign: "left", width: "28%" }}>Team</th>
                      <th style={{ border: "1px solid #d1d5db", padding: "4px", textAlign: "left", width: "12%" }}>Start Kart</th>
                      <th style={{ border: "1px solid #d1d5db", padding: "4px", textAlign: "left", width: "8%" }}>Stint</th>
                      <th style={{ border: "1px solid #d1d5db", padding: "4px", textAlign: "left", width: "9%" }}>Laps</th>
                      <th style={{ border: "1px solid #d1d5db", padding: "4px", textAlign: "left", width: "18%" }}>Best</th>
                      <th style={{ border: "1px solid #d1d5db", padding: "4px", textAlign: "left", width: "18%" }}>Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kartHistory.map((period, index) => {
                      const stats = period.stats;
                      const isOk = stats && stats.kind === "ok";
                      const lapsLabel = isOk ? String(stats.count) : "—";

                      const bestValue = isOk ? stats.best : null;
                      const avgValue = isOk && stats.avg !== null ? stats.avg : null;

                      const bestDelta =
                        bestValue !== null && summary.best !== null && bestValue > summary.best
                          ? bestValue - summary.best
                          : null;
                      const avgDelta =
                        avgValue !== null && summary.bestAvg !== null && avgValue > summary.bestAvg
                          ? avgValue - summary.bestAvg
                          : null;

                      const driver = isOk ? stats.driver : null;
                      return (
                        <tr key={index} style={{ backgroundColor: index % 2 === 1 ? "#f9fafb" : "white" }}>
                          <td style={{ border: "1px solid #d1d5db", padding: "4px" }}>{index + 1}</td>
                          <td
                            style={{
                              border: "1px solid #d1d5db",
                              padding: "4px",
                              overflow: "hidden",
                              whiteSpace: "normal",
                            }}
                          >
                            <div
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {period.teamName}
                            </div>
                            {driver && (
                              <div style={{ fontSize: "9px", color: "#6b7280", marginTop: "2px" }}>
                                {driver}
                              </div>
                            )}
                          </td>
                          <td style={{ border: "1px solid #d1d5db", padding: "4px" }}>
                            #{period.startKart.padStart(2, "0")}
                          </td>
                          <td style={{ border: "1px solid #d1d5db", padding: "4px" }}>{period.stintNumber}</td>
                          <td style={{ border: "1px solid #d1d5db", padding: "4px" }}>{lapsLabel}</td>
                          <td style={{ border: "1px solid #d1d5db", padding: "4px" }}>
                            {bestValue !== null ? formatLapTime(bestValue) : "—"}
                            {bestDelta !== null && (
                              <span style={{ color: "#6b7280", marginLeft: "4px" }}>
                                +{(bestDelta / 1000).toFixed(3)}
                              </span>
                            )}
                          </td>
                          <td style={{ border: "1px solid #d1d5db", padding: "4px" }}>
                            {avgValue !== null ? formatLapTime(avgValue) : "—"}
                            {avgDelta !== null && (
                              <span style={{ color: "#6b7280", marginLeft: "4px" }}>
                                +{(avgDelta / 1000).toFixed(3)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      {/* Секция пит-стопов */}
      {pitEvents.length > 0 && (
        <div
          className="pdf-avoid-break"
          style={{ marginTop: "32px", pageBreakInside: "avoid", breakInside: "avoid" }}
        >
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "bold",
              margin: "0 0 12px 0",
              backgroundColor: "#f3f4f6",
              padding: "12px",
              borderRadius: "4px",
            }}
          >
            Pit Stops Information
          </h2>
          <p style={{ margin: "0 0 16px 0" }}>Total pit stops: {pitEvents.length}</p>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              border: "1px solid #d1d5db",
              fontSize: "10px",
              tableLayout: "fixed",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <th style={{ border: "1px solid #d1d5db", padding: "4px", textAlign: "left", width: "10%" }}>#</th>
                <th style={{ border: "1px solid #d1d5db", padding: "4px", textAlign: "left", width: "33%" }}>Team</th>
                <th style={{ border: "1px solid #d1d5db", padding: "4px", textAlign: "left", width: "17%" }}>Start Kart</th>
                <th style={{ border: "1px solid #d1d5db", padding: "4px", textAlign: "left", width: "15%" }}>In</th>
                <th style={{ border: "1px solid #d1d5db", padding: "4px", textAlign: "left", width: "15%" }}>Out</th>
                <th style={{ border: "1px solid #d1d5db", padding: "4px", textAlign: "left", width: "10%" }}>Lane</th>
              </tr>
            </thead>
            <tbody>
              {pitEvents.map((event, index) => {
                const team = Object.values(teams).find((t) => t.startKart === event.kart);
                const pitCount = pitEvents.slice(0, index + 1).filter((e) => e.kart === event.kart).length;
                const laneLetters = ["A", "B", "C", "D", "E", "F"];
                const laneLetter = laneLetters[event.lane] || event.lane.toString();

                return (
                  <tr key={index} style={{ backgroundColor: index % 2 === 1 ? "#f9fafb" : "white" }}>
                    <td style={{ border: "1px solid #d1d5db", padding: "4px" }}>{index + 1}</td>
                    <td
                      style={{
                        border: "1px solid #d1d5db",
                        padding: "4px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {team ? team.name : "-"}
                    </td>
                    <td style={{ border: "1px solid #d1d5db", padding: "4px" }}>
                      {team ? `#${team.startKart.padStart(2, "0")}` : "-"}
                    </td>
                    <td style={{ border: "1px solid #d1d5db", padding: "4px" }}>
                      {team && team.karts[pitCount - 1] ? `#${team.karts[pitCount - 1].padStart(2, "0")}` : "-"}
                    </td>
                    <td style={{ border: "1px solid #d1d5db", padding: "4px" }}>
                      {team && team.karts[pitCount] ? `#${team.karts[pitCount].padStart(2, "0")}` : "-"}
                    </td>
                    <td style={{ border: "1px solid #d1d5db", padding: "4px" }}>{laneLetter}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
