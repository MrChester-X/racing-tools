"use client";
import { useRaceStore } from "../store/useRaceStore";
import { useLinkedHeatStore } from "../linked-heat/useLinkedHeatStore";
import { useInProgressLap } from "../linked-heat/useInProgressLap";
import { ParsedRaceTeam } from "../types";
import { TrackDef } from "./trackDefs";
import { pointAtFraction } from "./trackGeometry";

// Kart-condition palette (parallel to the mobile KART_COLORS Tailwind classes),
// as hex so it can fill SVG circles.
const CONDITION_HEX = ["#3b82f6", "#15803d", "#ca8a04", "#b91c1c", "#4b5563", "#ffffff"];

function conditionHex(kart: string, kartColors: Record<string, number>): { fill: string; dark: boolean } {
  const idx = kartColors[kart] ?? 5;
  return { fill: CONDITION_HEX[idx % CONDITION_HEX.length], dark: idx === 5 };
}

export function TrackMap({ track, teams }: { track: TrackDef; teams: ParsedRaceTeam[] }) {
  return (
    <svg
      viewBox={track.viewBox}
      className="block h-full w-full select-none"
      role="img"
      aria-label="Карта трассы и положение картов"
    >
      <defs>
        <filter id="kartGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g transform={track.transform}>
        {/* Track surface — layered strokes per segment, same look as the source. */}
        {track.segments.map((seg, i) => (
          <g key={i} strokeLinecap="round" strokeLinejoin="round" fill="none">
            <polyline points={seg} stroke="#1c2230" strokeWidth={12} />
            <polyline points={seg} stroke="#10151f" strokeWidth={8} />
            <polyline points={seg} stroke="rgba(231,235,240,0.04)" strokeWidth={8.5} />
          </g>
        ))}

        {/* Start-finish line */}
        <g>
          <line
            x1={track.startFinish.x1}
            y1={track.startFinish.y1}
            x2={track.startFinish.x2}
            y2={track.startFinish.y2}
            stroke="#ffffff"
            strokeWidth={1.6}
            strokeDasharray="0.8 0.8"
            strokeLinecap="butt"
          />
          <line
            x1={track.startFinish.x1}
            y1={track.startFinish.y1}
            x2={track.startFinish.x2}
            y2={track.startFinish.y2}
            stroke="#0b0e14"
            strokeWidth={1.6}
            strokeDasharray="0.8 0.8"
            strokeDashoffset={0.8}
            strokeLinecap="butt"
          />
        </g>

        {/* Kart markers */}
        {teams.map((t) => (
          <TrackMarker key={t.startKart} team={t} track={track} />
        ))}
      </g>
    </svg>
  );
}

function TrackMarker({ team, track }: { team: ParsedRaceTeam; track: TrackDef }) {
  const kartColors = useRaceStore((s) => s.raceData?.kartColors) ?? {};
  const position = useLinkedHeatStore((s) => s.latestByKart.get(team.startKart)?.position);
  const inProgress = useInProgressLap(team.startKart);

  // Lap progress 0..1 from elapsed-since-last-crossing vs recent average. No data
  // (not enough laps / no crossing yet) → park at the start-finish line.
  const progress =
    inProgress && inProgress.avgRecentMs && inProgress.avgRecentMs > 0
      ? Math.min(1, Math.max(0, inProgress.elapsedMs / inProgress.avgRecentMs))
      : 0;
  const [x, y] = pointAtFraction(track.centerline, progress, track.startOffset);

  const currentKart = team.karts[team.karts.length - 1];
  const { fill, dark } = conditionHex(currentKart, kartColors);
  const isLeader = position === 1;

  return (
    <g transform={`translate(${x} ${y})`} filter={isLeader ? "url(#kartGlow)" : undefined}>
      <title>
        Команда #{team.startKart} · карт #{currentKart}
        {team.name ? ` · ${team.name}` : ""}
      </title>
      {isLeader && (
        <circle r={6} fill="none" stroke={fill} strokeWidth={0.6} opacity={0.5}>
          <animate attributeName="r" values="4;8;4" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.55;0.15;0.55" dur="2.4s" repeatCount="indefinite" />
        </circle>
      )}
      <circle r={3.4} fill={fill} stroke="#0a0c10" strokeWidth={0.6} />
      <text
        x={0}
        y={1.4}
        textAnchor="middle"
        transform="scale(-1 1) rotate(70)"
        style={{
          fontFamily: '"Geist Mono", monospace',
          fontSize: "4.3px",
          fontWeight: 700,
          fill: dark ? "#0a0c10" : "#ffffff",
        }}
      >
        {team.startKart}
      </text>
    </g>
  );
}
