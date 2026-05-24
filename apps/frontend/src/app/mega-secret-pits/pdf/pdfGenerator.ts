import jsPDF from "jspdf";
import autoTable, { RowInput } from "jspdf-autotable";
import {
  buildKartHistory,
  computeStintStats,
  formatLapTime,
  getKartSummary,
  KartHistoryEntry,
  ReportInput,
} from "./reportData";

// F1-подобная палитра
const COLORS = {
  f1Red: [225, 6, 0] as [number, number, number], // F1 signature red
  f1RedDark: [176, 0, 0] as [number, number, number],
  black: [10, 10, 12] as [number, number, number],
  darkCard: [22, 22, 26] as [number, number, number],
  darkCardSoft: [38, 38, 44] as [number, number, number],
  offWhite: [245, 245, 247] as [number, number, number],
  muted: [107, 114, 128] as [number, number, number],
  mutedLight: [156, 163, 175] as [number, number, number],
  line: [228, 228, 231] as [number, number, number],
  lineDark: [60, 60, 66] as [number, number, number],
  rowAlt: [250, 250, 252] as [number, number, number],
  // Delta-шкала от зелёного к красному
  deltaHot: [16, 185, 129] as [number, number, number], // <0.3s — emerald
  deltaGood: [132, 204, 22] as [number, number, number], // 0.3-0.8s — lime
  deltaMid: [234, 179, 8] as [number, number, number], // 0.8-1.5s — amber
  deltaWarm: [249, 115, 22] as [number, number, number], // 1.5-3s — orange
  deltaHigh: [225, 6, 0] as [number, number, number], // >3s — red (F1-red)
  // Подсветка best
  absoluteBest: [124, 58, 237] as [number, number, number], // violet
  absoluteBestAvg: [16, 185, 129] as [number, number, number], // emerald
  text: [17, 24, 39] as [number, number, number],
};

function deltaColor(deltaMs: number): [number, number, number] {
  if (deltaMs < 300) return COLORS.deltaHot;
  if (deltaMs < 800) return COLORS.deltaGood;
  if (deltaMs < 1500) return COLORS.deltaMid;
  if (deltaMs < 3000) return COLORS.deltaWarm;
  return COLORS.deltaHigh;
}

let cachedRegular: string | null = null;
let cachedBold: string | null = null;

async function loadFontAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load font: ${url}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function ensureFonts(doc: jsPDF): Promise<void> {
  if (!cachedRegular) cachedRegular = await loadFontAsBase64("/fonts/Roboto-Regular.ttf");
  if (!cachedBold) cachedBold = await loadFontAsBase64("/fonts/Roboto-Bold.ttf");
  doc.addFileToVFS("Roboto-Regular.ttf", cachedRegular);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFileToVFS("Roboto-Bold.ttf", cachedBold);
  doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
  doc.setFont("Roboto", "normal");
}

export type PdfExportInput = ReportInput;

function estimateKartSectionHeight(rowCount: number): number {
  const headerBlock = 16;
  const tableHead = 7;
  const rowHeight = 5.8;
  const tablePadding = 4;
  return headerBlock + tableHead + rowCount * rowHeight + tablePadding;
}

// Рисуем чёрно-белую шашечную полосу (клетчатый флаг)
function drawChequer(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  cellSize: number,
) {
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBlack = (r + c) % 2 === 0;
      if (isBlack) {
        doc.setFillColor(10, 10, 12);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      const cx = x + c * cellSize;
      const cy = y + r * cellSize;
      const cw = Math.min(cellSize, width - c * cellSize);
      const ch = Math.min(cellSize, height - r * cellSize);
      doc.rect(cx, cy, cw, ch, "F");
    }
  }
}

// Диагональные полосы (типа карбон/racing livery)
function drawDiagonalStripes(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  color: [number, number, number],
  spacing: number,
  strokeWidth: number,
) {
  doc.setDrawColor(...color);
  doc.setLineWidth(strokeWidth);
  // Строим полосы от (x, y+height) снизу-слева до (x+width, y) сверху-справа
  // Для этого рисуем наклонные линии с шагом spacing, обрезая по прямоугольнику.
  // Для простоты — линии идут от каждой точки на нижнем/левом крае к правому/верхнему.
  const diag = width + height;
  for (let d = -height; d < diag; d += spacing) {
    // начало: либо на левом крае, либо на верхнем
    let x1 = x + d;
    let y1 = y;
    if (d < 0) {
      x1 = x;
      y1 = y - d;
    }
    // конец: либо на нижнем крае, либо на правом
    let x2 = x + d + height;
    let y2 = y + height;
    if (x2 > x + width) {
      const overshoot = x2 - (x + width);
      x2 = x + width;
      y2 = y + height - overshoot;
    }
    if (x1 >= x + width || y1 >= y + height) continue;
    doc.line(x1, y1, x2, y2);
  }
}

// Левый pit-wall decor на странице
function drawLeftPitWall(
  doc: jsPDF,
  pageHeight: number,
  startY: number,
  endY: number,
) {
  const stripW = 3;
  doc.setFillColor(10, 10, 12);
  doc.rect(0, startY, stripW, endY - startY, "F");
  doc.setFillColor(225, 6, 0);
  const step = 14;
  for (let y = startY + 4; y < endY - 3; y += step) {
    doc.rect(0, y, stripW, 1.2, "F");
  }
  // Тонкая красная вертикальная линия справа от чёрной полосы
  doc.setDrawColor(225, 6, 0);
  doc.setLineWidth(0.3);
  doc.line(stripW + 0.3, startY, stripW + 0.3, endY);
}

export async function generatePdf(input: PdfExportInput, filename: string): Promise<void> {
  const { teams, events, pitlane, raceData, linkedHeat, linkedLapsByKart } = input;
  const maxLapSec = raceData.settings?.maxLapTimeForAverageSec;
  const raceName = raceData.settings?.raceName?.trim();

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  await ensureFonts(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const marginBottom = 14;

  let cursorY = 0;

  // =============== HERO HEADER ===============
  const heroHeight = 38;

  // Чёрный фон hero
  doc.setFillColor(...COLORS.black);
  doc.rect(0, 0, pageWidth, heroHeight, "F");

  // Красная диагональная «скоростная» полоса (через несколько узких полос)
  doc.setFillColor(...COLORS.f1Red);
  doc.rect(0, heroHeight - 8, pageWidth, 2, "F");
  doc.setFillColor(...COLORS.f1RedDark);
  doc.rect(0, heroHeight - 5, pageWidth, 1, "F");

  // Клетчатый флаг сверху слева (тонкая полоска)
  drawChequer(doc, 0, 0, pageWidth, 2.2, 2.2);

  // Red speed streaks — диагональные линии в правой части hero
  drawDiagonalStripes(
    doc,
    pageWidth * 0.62,
    3,
    pageWidth * 0.38,
    heroHeight - 10,
    COLORS.f1RedDark,
    2.8,
    0.25,
  );
  // И более светлые поверх, для глубины
  drawDiagonalStripes(
    doc,
    pageWidth * 0.66,
    3,
    pageWidth * 0.34,
    heroHeight - 10,
    COLORS.f1Red,
    3.6,
    0.4,
  );

  // Название
  doc.setFont("Roboto", "bold");
  doc.setFontSize(28);
  doc.setTextColor(255, 255, 255);
  doc.text("RACE REPORT", marginX, 18);

  if (raceName) {
    doc.setFont("Roboto", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.f1Red);
    doc.text(raceName, marginX, 25);
  }

  // Мета справа
  const now = new Date();
  const exportLabel = now.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.setFont("Roboto", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.mutedLight);
  doc.text(exportLabel.toUpperCase(), pageWidth - marginX, 14, { align: "right" });
  if (typeof maxLapSec === "number" && maxLapSec > 0) {
    doc.text(`AVG CAP  ${maxLapSec}s`, pageWidth - marginX, 19, { align: "right" });
  }

  // Нижняя клетка hero
  drawChequer(doc, 0, heroHeight - 2.2, pageWidth, 2.2, 2.2);

  cursorY = heroHeight + 6;

  // =============== STATS STRIP ===============
  const allKarts = new Set<string>();
  Object.values(teams).forEach((t) => t.karts.forEach((k) => allKarts.add(k)));
  const sortedKarts = Array.from(allKarts).sort((a, b) => parseInt(a) - parseInt(b));

  const kartsInPits = new Set<string>();
  pitlane.forEach((lane) => lane.forEach((k) => kartsInPits.add(k)));

  const pitEvents = events.filter((e) => e.type === "pit");
  const teamsCount = Object.keys(teams).length;

  const stats = [
    { label: "TEAMS", value: String(teamsCount) },
    { label: "KARTS", value: String(sortedKarts.length) },
    { label: "PIT STOPS", value: String(pitEvents.length) },
    { label: "IN PITS", value: String(kartsInPits.size) },
  ];
  const gap = 3;
  const statW = (pageWidth - marginX * 2 - gap * (stats.length - 1)) / stats.length;
  const statH = 15;
  stats.forEach((s, i) => {
    const x = marginX + i * (statW + gap);
    // Тёмная карточка
    doc.setFillColor(...COLORS.darkCard);
    doc.rect(x, cursorY, statW, statH, "F");
    // Красная вертикальная полоска слева
    doc.setFillColor(...COLORS.f1Red);
    doc.rect(x, cursorY, 1.2, statH, "F");
    // Лейбл
    doc.setFont("Roboto", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.mutedLight);
    doc.text(s.label, x + 4, cursorY + 4.8);
    // Число
    doc.setFont("Roboto", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(s.value, x + 4, cursorY + 12);
  });
  cursorY += statH + 8;

  // =============== helpers ===============
  const drawSectionTitle = (title: string) => {
    // Чёрная полоса с красным треугольным клином
    const barH = 6;
    const barW = pageWidth - marginX * 2;
    doc.setFillColor(...COLORS.black);
    doc.rect(marginX, cursorY, barW, barH, "F");

    // Серия красных треугольных шевронов справа — racing accent
    const chevronCount = 5;
    const chevronSize = 4;
    const chevronSpacing = 2;
    let chevX = marginX + barW - 3;
    for (let i = 0; i < chevronCount; i++) {
      const alpha = i / chevronCount;
      const rComp = Math.round(COLORS.f1Red[0] * (1 - alpha * 0.7));
      doc.setFillColor(rComp, Math.round(COLORS.f1Red[1] * (1 - alpha * 0.7)), Math.round(COLORS.f1Red[2] * (1 - alpha * 0.7)));
      doc.triangle(
        chevX, cursorY + barH / 2,
        chevX - chevronSize, cursorY,
        chevX - chevronSize, cursorY + barH,
        "F",
      );
      chevX -= chevronSize + chevronSpacing;
    }

    // Треугольник слева — ключевой акцент
    doc.setFillColor(...COLORS.f1Red);
    doc.triangle(
      marginX,
      cursorY,
      marginX + 6,
      cursorY,
      marginX,
      cursorY + barH,
      "F",
    );
    doc.setFont("Roboto", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), marginX + 8, cursorY + 4.2);
    cursorY += barH + 4;
  };

  const drawKartHeader = (
    kartNumber: string,
    summary: { best: number | null; bestAvg: number | null },
    isInPits: boolean,
  ) => {
    const h = 13;
    const w = pageWidth - marginX * 2;
    // Основной тёмный фон
    doc.setFillColor(...COLORS.darkCard);
    doc.rect(marginX, cursorY, w, h, "F");

    // Карбон-фибр эффект — тонкие диагональные линии поверх
    drawDiagonalStripes(
      doc,
      marginX,
      cursorY,
      w,
      h,
      COLORS.darkCardSoft,
      1.6,
      0.15,
    );

    // Красный акцент слева — треугольный клин
    doc.setFillColor(...COLORS.f1Red);
    doc.triangle(
      marginX, cursorY,
      marginX + 3.5, cursorY,
      marginX, cursorY + h,
      "F",
    );
    doc.setFillColor(...COLORS.f1RedDark);
    doc.rect(marginX, cursorY + h - 1.2, 18, 1.2, "F");

    // Квадрат с номером карта (красный)
    const boxSize = 9;
    const boxX = marginX + 5;
    const boxY = cursorY + (h - boxSize) / 2;
    doc.setFillColor(...COLORS.f1Red);
    doc.rect(boxX, boxY, boxSize, boxSize, "F");
    doc.setFont("Roboto", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(kartNumber.padStart(2, "0"), boxX + boxSize / 2, boxY + boxSize / 2 + 1.5, { align: "center" });

    // Label
    doc.setFont("Roboto", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...COLORS.mutedLight);
    doc.text("KART", boxX + boxSize + 3, cursorY + 5.8);
    doc.setFont("Roboto", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(`#${kartNumber.padStart(2, "0")}`, boxX + boxSize + 3, cursorY + 10.5);

    let leftEdge = boxX + boxSize + 3 + doc.getTextWidth(`#${kartNumber.padStart(2, "0")}`);

    if (isInPits) {
      const padX = 2;
      const badgeW = doc.getTextWidth("IN PITS") + padX * 2 + 1;
      const badgeH = 4.5;
      const bx = leftEdge + 5;
      const by = cursorY + 5.5;
      doc.setFillColor(...COLORS.f1Red);
      doc.rect(bx, by, badgeW, badgeH, "F");
      doc.setFont("Roboto", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
      doc.text("IN PITS", bx + badgeW / 2, by + 3.2, { align: "center" });
      leftEdge += 5 + badgeW;
    }

    // Справа — BEST и BEST AVG
    if (linkedHeat && (summary.best !== null || summary.bestAvg !== null)) {
      const blocks: { label: string; value: string; color: [number, number, number] }[] = [];
      if (summary.best !== null) blocks.push({ label: "BEST", value: formatLapTime(summary.best), color: COLORS.absoluteBest });
      if (summary.bestAvg !== null) blocks.push({ label: "BEST AVG", value: formatLapTime(summary.bestAvg), color: COLORS.absoluteBestAvg });

      let xRight = marginX + w - 4;
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        doc.setFont("Roboto", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...b.color);
        const valueW = doc.getTextWidth(b.value);
        doc.text(b.value, xRight, cursorY + 9, { align: "right" });

        doc.setFont("Roboto", "bold");
        doc.setFontSize(5.5);
        doc.setTextColor(...COLORS.mutedLight);
        doc.text(b.label, xRight, cursorY + 4.5, { align: "right" });

        xRight -= Math.max(valueW, doc.getTextWidth(b.label)) + 8;
      }
    }

    cursorY += h + 1;
  };

  const drawKartSection = (
    kartNumber: string,
    history: KartHistoryEntry[],
    summary: { best: number | null; bestAvg: number | null },
    isInPits: boolean,
  ) => {
    drawKartHeader(kartNumber, summary, isInPits);

    if (history.length === 0) {
      doc.setFont("Roboto", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.muted);
      doc.text("No teams found", marginX + 4, cursorY + 4);
      cursorY += 8;
      return;
    }

    type CellBundle = {
      content: string;
      bestDelta: number | null;
      avgDelta: number | null;
      bestIsAbsolute: boolean;
      avgIsAbsolute: boolean;
    };
    const metadataPerRow: CellBundle[] = [];

    const rows: RowInput[] = history.map((period, idx) => {
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
      const bestIsAbsolute = bestValue !== null && summary.best !== null && bestValue === summary.best;
      const avgIsAbsolute = avgValue !== null && summary.bestAvg !== null && avgValue === summary.bestAvg;

      const bestLabel =
        bestValue !== null
          ? bestDelta !== null
            ? `${formatLapTime(bestValue)}   +${(bestDelta / 1000).toFixed(3)}`
            : formatLapTime(bestValue)
          : "—";
      const avgLabel =
        avgValue !== null
          ? avgDelta !== null
            ? `${formatLapTime(avgValue)}   +${(avgDelta / 1000).toFixed(3)}`
            : formatLapTime(avgValue)
          : "—";

      const teamCell = period.teamName + (isOk && stats.driver ? `\n${stats.driver}` : "");

      metadataPerRow.push({ content: "", bestDelta, avgDelta, bestIsAbsolute, avgIsAbsolute });

      return [
        { content: String(idx + 1), styles: { halign: "center", textColor: COLORS.muted } },
        { content: teamCell },
        { content: `#${period.startKart.padStart(2, "0")}`, styles: { halign: "center", fontStyle: "bold" } },
        { content: String(period.stintNumber), styles: { halign: "center" } },
        { content: lapsLabel, styles: { halign: "center" } },
        { content: bestLabel },
        { content: avgLabel },
      ];
    });

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      head: [["#", "TEAM / DRIVER", "START", "STINT", "LAPS", "BEST", "AVG"]],
      body: rows,
      theme: "plain",
      styles: {
        font: "Roboto",
        fontSize: 8.5,
        cellPadding: 2.2,
        overflow: "linebreak",
        lineColor: COLORS.line,
        lineWidth: 0.1,
      },
      headStyles: {
        font: "Roboto",
        fontStyle: "bold",
        fillColor: COLORS.black,
        textColor: [255, 255, 255],
        fontSize: 7,
        cellPadding: { top: 2.4, bottom: 2.4, left: 2.2, right: 2.2 },
        lineWidth: 0,
      },
      alternateRowStyles: { fillColor: COLORS.rowAlt },
      rowPageBreak: "avoid",
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 56 },
        2: { cellWidth: 18, halign: "center" },
        3: { cellWidth: 13, halign: "center" },
        4: { cellWidth: 13, halign: "center" },
        5: { cellWidth: 32 },
        6: { cellWidth: 32 },
      },
      didParseCell: (hookData) => {
        if (hookData.section !== "body") return;
        const rowIndex = hookData.row.index;
        const meta = metadataPerRow[rowIndex];
        if (!meta) return;

        // Имя пилота (вторая строка в Team): мельче и серым
        if (hookData.column.index === 1) {
          const raw = String(hookData.cell.raw ?? "");
          if (raw.includes("\n")) {
            hookData.cell.styles.fontSize = 7.5;
            hookData.cell.styles.textColor = COLORS.muted;
          }
        }
      },
      didDrawCell: (hookData) => {
        if (hookData.section !== "body") return;
        const rowIndex = hookData.row.index;
        const meta = metadataPerRow[rowIndex];
        if (!meta) return;

        // Подсветка абсолютных бестов — небольшая цветная полоска слева от ячейки
        const cellX = hookData.cell.x;
        const cellY = hookData.cell.y;
        const cellH = hookData.cell.height;
        const ci = hookData.column.index;

        if (ci === 5 && meta.bestIsAbsolute) {
          doc.setFillColor(...COLORS.absoluteBest);
          doc.rect(cellX, cellY, 1.2, cellH, "F");
        }
        if (ci === 6 && meta.avgIsAbsolute) {
          doc.setFillColor(...COLORS.absoluteBestAvg);
          doc.rect(cellX, cellY, 1.2, cellH, "F");
        }

        // Рендер бест/авг с раскраской дельты
        if (ci === 5 || ci === 6) {
          const delta = ci === 5 ? meta.bestDelta : meta.avgDelta;
          const isAbsolute = ci === 5 ? meta.bestIsAbsolute : meta.avgIsAbsolute;
          const raw = String(hookData.cell.raw && typeof hookData.cell.raw === "object" && "content" in hookData.cell.raw
            ? (hookData.cell.raw as { content: string }).content
            : hookData.cell.raw ?? "");

          // Если это «—» или нет дельты — ничего не меняем (autoTable уже отрисовал текст)
          if (!raw.includes("+") || delta === null) return;

          // Перерисуем поверх: сначала затираем фоном ячейки (alt или white)
          const bgColor = rowIndex % 2 === 1 ? COLORS.rowAlt : [255, 255, 255] as [number, number, number];
          doc.setFillColor(...bgColor);
          // Сдвиг от левой полоски подсветки, если есть
          const padLeft = isAbsolute ? 2.4 : 2.2;
          doc.rect(cellX + padLeft - 0.2, cellY + 0.5, hookData.cell.width - padLeft, cellH - 1, "F");

          // Время — жирным, цветом best если absolute, иначе обычным dark
          const [timePart, deltaPart] = raw.split("   +");
          const timeX = cellX + padLeft;
          const baseY = cellY + cellH / 2 + 1.2;

          doc.setFont("Roboto", isAbsolute ? "bold" : "normal");
          doc.setFontSize(8.5);
          const timeColor = isAbsolute
            ? (ci === 5 ? COLORS.absoluteBest : COLORS.absoluteBestAvg)
            : COLORS.text;
          doc.setTextColor(...timeColor);
          doc.text(timePart, timeX, baseY);

          if (deltaPart) {
            const timeW = doc.getTextWidth(timePart);
            doc.setFont("Roboto", "bold");
            doc.setFontSize(7.5);
            doc.setTextColor(...deltaColor(delta));
            doc.text(`+${deltaPart}`, timeX + timeW + 2, baseY);
          }
        }
      },
    });

    // @ts-expect-error — jspdf-autotable добавляет lastAutoTable в runtime
    cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 7;
  };

  drawSectionTitle("Karts");

  const minLapSec = raceData.settings?.minLapTimeSec;
  for (const kartNumber of sortedKarts) {
    const history = buildKartHistory(
      kartNumber,
      teams,
      events,
      linkedLapsByKart,
      !!linkedHeat,
      maxLapSec,
      minLapSec,
    );
    const summary = getKartSummary(history);
    const isInPits = kartsInPits.has(kartNumber);

    const estimated = estimateKartSectionHeight(Math.max(history.length, 1));
    const remaining = pageHeight - cursorY - marginBottom;
    const maxPerPage = pageHeight - 20 - marginBottom;

    if (estimated > remaining && estimated <= maxPerPage) {
      doc.addPage();
      cursorY = 15;
    }

    drawKartSection(kartNumber, history, summary, isInPits);
  }

  // =============== PIT STOPS ===============
  if (pitEvents.length > 0) {
    const pitHeaderBlock = 12;
    const pitHeadRow = 7;
    const pitRowHeight = 5.8;
    const estimatedPit = pitHeaderBlock + pitHeadRow + pitEvents.length * pitRowHeight;
    const remaining = pageHeight - cursorY - marginBottom;
    const maxPerPage = pageHeight - 20 - marginBottom;
    if (estimatedPit > remaining && estimatedPit <= maxPerPage) {
      doc.addPage();
      cursorY = 15;
    }

    drawSectionTitle(`Pit Stops · ${pitEvents.length} total`);

    const laneLetters = ["A", "B", "C", "D", "E", "F"];
    const pitRows: RowInput[] = pitEvents.map((event, index) => {
      const team = Object.values(teams).find((t) => t.startKart === event.kart);
      const pitCount = pitEvents.slice(0, index + 1).filter((e) => e.kart === event.kart).length;
      return [
        { content: String(index + 1), styles: { halign: "center", textColor: COLORS.muted } },
        team ? team.name : "—",
        { content: team ? `#${team.startKart.padStart(2, "0")}` : "—", styles: { halign: "center", fontStyle: "bold" } },
        {
          content: team && team.karts[pitCount - 1] ? `#${team.karts[pitCount - 1].padStart(2, "0")}` : "—",
          styles: { halign: "center", textColor: COLORS.f1Red, fontStyle: "bold" },
        },
        {
          content: team && team.karts[pitCount] ? `#${team.karts[pitCount].padStart(2, "0")}` : "—",
          styles: { halign: "center", textColor: COLORS.absoluteBestAvg, fontStyle: "bold" },
        },
        { content: laneLetters[event.lane] ?? String(event.lane), styles: { halign: "center" } },
      ];
    });

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      head: [["#", "TEAM", "START", "IN", "OUT", "LANE"]],
      body: pitRows,
      theme: "plain",
      styles: {
        font: "Roboto",
        fontSize: 8.5,
        cellPadding: 2.2,
        lineColor: COLORS.line,
        lineWidth: 0.1,
      },
      headStyles: {
        font: "Roboto",
        fontStyle: "bold",
        fillColor: COLORS.black,
        textColor: [255, 255, 255],
        fontSize: 7,
        cellPadding: { top: 2.4, bottom: 2.4, left: 2.2, right: 2.2 },
        lineWidth: 0,
      },
      alternateRowStyles: { fillColor: COLORS.rowAlt },
      rowPageBreak: "avoid",
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 72 },
        2: { cellWidth: 22 },
        3: { cellWidth: 22 },
        4: { cellWidth: 22 },
        5: { cellWidth: 18 },
      },
    });
  }

  // =============== LEGEND (только если есть linkedHeat) ===============
  if (linkedHeat) {
    cursorY = pageHeight - marginBottom - 8;
    doc.setFont("Roboto", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.muted);
    doc.text("DELTA LEGEND", marginX, cursorY);

    const legendItems: { label: string; color: [number, number, number] }[] = [
      { label: "<0.3s", color: COLORS.deltaHot },
      { label: "<0.8s", color: COLORS.deltaGood },
      { label: "<1.5s", color: COLORS.deltaMid },
      { label: "<3s", color: COLORS.deltaWarm },
      { label: "≥3s", color: COLORS.deltaHigh },
    ];
    let lx = marginX + 22;
    const ly = cursorY - 1.5;
    legendItems.forEach((it) => {
      doc.setFillColor(...it.color);
      doc.rect(lx, ly, 2.2, 2.2, "F");
      doc.setFont("Roboto", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...COLORS.muted);
      doc.text(it.label, lx + 3, ly + 2);
      lx += 12;
    });
  }

  // =============== FOOTER и фоновый декор на каждой странице ===============
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);

    // Left pit-wall: от hero (на 1-й) или от самого верха (на остальных) до футера
    const stripStartY = i === 1 ? heroHeight : 0;
    drawLeftPitWall(doc, pageHeight, stripStartY, pageHeight - 3);

    // Красная тонкая полоска внизу
    doc.setFillColor(...COLORS.f1Red);
    doc.rect(0, pageHeight - 3, pageWidth, 3, "F");
    // Клетка
    drawChequer(doc, 0, pageHeight - 1.2, pageWidth, 1.2, 1.2);

    doc.setFont("Roboto", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`${i} / ${total}`, pageWidth - marginX, pageHeight - 5, { align: "right" });
    doc.setFont("Roboto", "normal");
    doc.setTextColor(255, 255, 255);
    doc.text("ACE OF PACE", marginX, pageHeight - 5);
  }

  doc.save(filename);
}
