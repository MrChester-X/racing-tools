"use client";
import { useRaceStore } from "../store/useRaceStore";
import { useTrackProgress } from "../linked-heat/useTrackProgress";
import { useFavoriteTeamsStore } from "../store/useFavoriteTeamsStore";
import { ParsedRaceTeam } from "../types";
import { TrackDef } from "./trackDefs";
import { pointAtFraction, pointAtLength } from "./trackGeometry";

// Kart-condition palette (parallel to the mobile KART_COLORS Tailwind classes),
// as hex so it can fill SVG circles.
const CONDITION_HEX = ["#3b82f6", "#15803d", "#ca8a04", "#b91c1c", "#4b5563", "#ffffff"];

function conditionHex(kart: string, kartColors: Record<string, number>): { fill: string; dark: boolean } {
  const idx = kartColors[kart] ?? 5;
  return { fill: CONDITION_HEX[idx % CONDITION_HEX.length], dark: idx === 5 };
}

// Marker radius in track units; two markers closer than ~this overlap.
const MARKER_R = 3.4;
// Karts whose centres are within this distance count as "running together" and get
// fanned apart so neither number hides the other.
const CLUSTER_DIST = 2 * MARKER_R - 1.4;
// Gap between fanned markers (slightly more than a diameter → a hair of breathing room).
const FAN_SPACING = 2 * MARKER_R + 1;

interface Placed {
  team: ParsedRaceTeam;
  frac: number;
  x: number;
  y: number;
}

// Resolve where each kart's marker is drawn. Karts running nose-to-tail are
// collapsed onto their shared track point and fanned out perpendicular to the
// track, so both numbers stay visible ("веером в сторону").
function resolvePositions(
  teams: ParsedRaceTeam[],
  progress: Map<string, { progress: number; hasData: boolean }>,
  track: TrackDef,
): { team: ParsedRaceTeam; x: number; y: number }[] {
  const cl = track.centerline;
  const out: { team: ParsedRaceTeam; x: number; y: number }[] = [];
  const base: Placed[] = [];
  for (const team of teams) {
    const pr = progress.get(team.startKart);
    const frac = pr?.progress ?? 0;
    const [x, y] = pointAtFraction(cl, frac, track.startOffset);
    // Only live karts get fanned out; no-data karts just sit at the start line
    // (as before) so the grid doesn't explode into a huge fan before the race.
    if (pr?.hasData) base.push({ team, frac, x, y });
    else out.push({ team, x, y });
  }

  // Walk markers in track order; start a new cluster whenever the next marker is
  // far enough from the previous one to no longer overlap.
  const sorted = [...base].sort((a, b) => a.frac - b.frac);
  const clusters: Placed[][] = [];
  for (const p of sorted) {
    const last = clusters[clusters.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) <= CLUSTER_DIST) last.push(p);
    else clusters.push([p]);
  }

  for (const cluster of clusters) {
    if (cluster.length === 1) {
      out.push({ team: cluster[0].team, x: cluster[0].x, y: cluster[0].y });
      continue;
    }
    // Anchor the whole pack at its mean track point and splay along the local normal.
    const meanFrac = cluster.reduce((s, p) => s + p.frac, 0) / cluster.length;
    const d = track.startOffset + meanFrac * cl.total;
    const eps = Math.max(0.5, cl.total * 0.003);
    const [ax, ay] = pointAtLength(cl, d - eps);
    const [bx, by] = pointAtLength(cl, d + eps);
    const tlen = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / tlen; // unit normal = rotate unit tangent 90°
    const ny = (bx - ax) / tlen;
    const [mx, my] = pointAtLength(cl, d);
    // Leader (furthest into the lap) first, for a stable top-to-bottom order.
    const ordered = [...cluster].sort((a, b) => b.frac - a.frac);
    ordered.forEach((p, i) => {
      const offset = (i - (ordered.length - 1) / 2) * FAN_SPACING;
      out.push({ team: p.team, x: mx + nx * offset, y: my + ny * offset });
    });
  }
  return out;
}

export function TrackMap({ track, teams }: { track: TrackDef; teams: ParsedRaceTeam[] }) {
  const progress = useTrackProgress(teams.map((t) => t.startKart));
  const placed = resolvePositions(teams, progress, track);

  return (
    <svg
      viewBox={track.viewBox}
      className="block h-full w-full select-none"
      role="img"
      aria-label="Карта трассы и положение картов"
    >
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

        {/* Kart markers — positions already de-overlapped by resolvePositions. */}
        {placed.map(({ team, x, y }) => (
          <TrackMarker key={team.startKart} team={team} x={x} y={y} labelTransform={track.labelTransform} />
        ))}
      </g>
    </svg>
  );
}

function TrackMarker({ team, x, y, labelTransform }: { team: ParsedRaceTeam; x: number; y: number; labelTransform: string }) {
  const kartColors = useRaceStore((s) => s.raceData?.kartColors) ?? {};
  const isFavorite = useFavoriteTeamsStore((s) => !!s.favorites[team.startKart]);

  const currentKart = team.karts[team.karts.length - 1];
  const { fill, dark } = conditionHex(currentKart, kartColors);

  return (
    <g transform={`translate(${x} ${y})`}>
      <title>
        Команда #{team.startKart} · карт #{currentKart}
        {team.name ? ` · ${team.name}` : ""}
      </title>
      {/* Favorite team — blinking amber halo so it's easy to spot. */}
      {isFavorite && (
        <circle r={5.2} fill="none" stroke="#fbbf24" strokeWidth={1}>
          <animate attributeName="opacity" values="1;0.1;1" dur="0.9s" repeatCount="indefinite" />
        </circle>
      )}
      <circle r={MARKER_R} fill={fill} stroke={isFavorite ? "#fbbf24" : "#0a0c10"} strokeWidth={isFavorite ? 1 : 0.6}>
        {isFavorite && <animate attributeName="opacity" values="1;0.35;1" dur="0.9s" repeatCount="indefinite" />}
      </circle>
      <text
        x={0}
        y={1.4}
        textAnchor="middle"
        transform={labelTransform || undefined}
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
