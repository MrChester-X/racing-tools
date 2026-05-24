import {
  buildKartHistory,
  formatLapTime,
  getKartSummary,
  ReportInput,
} from "./reportData";

function esc(s: string): string {
  // Экранирование pipe для markdown-таблиц
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function generateMarkdown(input: ReportInput): string {
  const { teams, events, pitlane, raceData, linkedHeat, linkedLapsByKart } = input;
  const maxLapSec = raceData.settings?.maxLapTimeForAverageSec;
  const raceName = raceData.settings?.raceName?.trim();

  const allKarts = new Set<string>();
  Object.values(teams).forEach((t) => t.karts.forEach((k) => allKarts.add(k)));
  const sortedKarts = Array.from(allKarts).sort((a, b) => parseInt(a) - parseInt(b));

  const kartsInPits = new Set<string>();
  pitlane.forEach((lane) => lane.forEach((k) => kartsInPits.add(k)));

  const pitEvents = events.filter((e) => e.type === "pit");
  const teamsCount = Object.keys(teams).length;

  const lines: string[] = [];

  // Заголовок
  lines.push(`# Race Report${raceName ? ` — ${raceName}` : ""}`);
  lines.push("");
  const now = new Date();
  lines.push(
    `Exported: ${now.toLocaleString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })}`,
  );
  if (linkedHeat) lines.push(`Linked heat: ${linkedHeat.name}`);
  if (typeof maxLapSec === "number" && maxLapSec > 0) {
    lines.push(`Avg excludes laps > ${maxLapSec}s`);
  }
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Teams: ${teamsCount}`);
  lines.push(`- Karts: ${sortedKarts.length}`);
  lines.push(`- Pit stops: ${pitEvents.length}`);
  lines.push(`- In pits now: ${kartsInPits.size}`);
  lines.push("");

  // Секция «Karts»
  lines.push("## Karts");
  lines.push("");

  for (const kartNumber of sortedKarts) {
    const history = buildKartHistory(
      kartNumber,
      teams,
      events,
      linkedLapsByKart,
      !!linkedHeat,
      maxLapSec,
      raceData.settings?.minLapTimeSec,
    );
    const summary = getKartSummary(history);
    const isInPits = kartsInPits.has(kartNumber);

    const titleParts: string[] = [`### Kart #${kartNumber.padStart(2, "0")}`];
    if (isInPits) titleParts.push("🅿️ in pits");
    lines.push(titleParts.join(" — "));

    const sub: string[] = [];
    if (summary.best !== null) sub.push(`best **${formatLapTime(summary.best)}**`);
    if (summary.bestAvg !== null) sub.push(`best avg **${formatLapTime(summary.bestAvg)}**`);
    if (sub.length > 0) lines.push(sub.join(" · "));
    lines.push("");

    if (history.length === 0) {
      lines.push("_No teams found_");
      lines.push("");
      continue;
    }

    lines.push("| # | Team | Driver | Start | Stint | Laps | Best | Avg |");
    lines.push("|---|------|--------|-------|-------|------|------|-----|");

    history.forEach((period, idx) => {
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

      const bestLabel =
        bestValue !== null
          ? bestDelta !== null
            ? `${formatLapTime(bestValue)} (+${(bestDelta / 1000).toFixed(3)})`
            : formatLapTime(bestValue)
          : "—";
      const avgLabel =
        avgValue !== null
          ? avgDelta !== null
            ? `${formatLapTime(avgValue)} (+${(avgDelta / 1000).toFixed(3)})`
            : formatLapTime(avgValue)
          : "—";

      const driver = isOk && stats.driver ? stats.driver : "—";

      lines.push(
        `| ${idx + 1} | ${esc(period.teamName)} | ${esc(driver)} | #${period.startKart.padStart(2, "0")} | ${period.stintNumber} | ${lapsLabel} | ${bestLabel} | ${avgLabel} |`,
      );
    });
    lines.push("");
  }

  // Pit stops
  if (pitEvents.length > 0) {
    lines.push(`## Pit Stops — ${pitEvents.length} total`);
    lines.push("");
    lines.push("| # | Team | Start | In | Out | Lane |");
    lines.push("|---|------|-------|----|-----|------|");
    const laneLetters = ["A", "B", "C", "D", "E", "F"];
    pitEvents.forEach((event, index) => {
      const team = Object.values(teams).find((t) => t.startKart === event.kart);
      const pitCount = pitEvents.slice(0, index + 1).filter((e) => e.kart === event.kart).length;
      lines.push(
        `| ${index + 1} | ${team ? esc(team.name) : "—"} | ${team ? `#${team.startKart.padStart(2, "0")}` : "—"} | ${team && team.karts[pitCount - 1] ? `#${team.karts[pitCount - 1].padStart(2, "0")}` : "—"} | ${team && team.karts[pitCount] ? `#${team.karts[pitCount].padStart(2, "0")}` : "—"} | ${laneLetters[event.lane] ?? String(event.lane)} |`,
      );
    });
    lines.push("");
  }

  return lines.join("\n");
}

export function downloadMarkdown(input: ReportInput, filename: string): void {
  const md = generateMarkdown(input);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
