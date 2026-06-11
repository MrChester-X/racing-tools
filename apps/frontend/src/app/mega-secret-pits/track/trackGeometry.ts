export type Pt = [number, number];

/** Parse an SVG polyline `points` string ("x,y x,y …") into coordinate pairs. */
export function parsePoints(s: string): Pt[] {
  return s
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return [x, y] as Pt;
    });
}

export interface Centerline {
  points: Pt[];
  /** Cumulative arc length at each point; cum[0] = 0. */
  cum: number[];
  total: number;
}

export function buildCenterline(points: Pt[]): Centerline {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return { points, cum, total: cum[cum.length - 1] || 1 };
}

/** Point at arc-length `d` along the centerline; `d` wraps around the loop. */
export function pointAtLength(cl: Centerline, d: number): Pt {
  const { points, cum, total } = cl;
  if (points.length === 1) return points[0];
  const dist = ((d % total) + total) % total;
  let i = 1;
  while (i < cum.length && cum[i] < dist) i++;
  if (i >= points.length) return points[points.length - 1];
  const segLen = cum[i] - cum[i - 1] || 1;
  const t = (dist - cum[i - 1]) / segLen;
  const [x0, y0] = points[i - 1];
  const [x1, y1] = points[i];
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
}

/** Arc length of the centerline vertex nearest to (x, y) — good enough to anchor
 * the start-finish line onto the loop. */
export function nearestLength(cl: Centerline, x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < cl.points.length; i++) {
    const dx = cl.points[i][0] - x;
    const dy = cl.points[i][1] - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = cl.cum[i];
    }
  }
  return best;
}

/** Point at lap fraction (0..1) measured from `startOffset` along the loop. */
export function pointAtFraction(cl: Centerline, frac: number, startOffset: number): Pt {
  return pointAtLength(cl, startOffset + frac * cl.total);
}
