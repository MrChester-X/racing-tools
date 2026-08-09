const KARTODROM_LABELS: Record<string, string> = {
  'pitstop-premium': 'PitStop Premium',
  'pitstop-narvskaya': 'PitStop Narvskaya',
  'racemann-pitstop': 'PitStop Narvskaya Racemann',
  'racemann-miks': 'Miks Racemann Indoor',
  'racemann-miksevents': 'Miks Racemann Outdoor',
  'igora-karting': 'Igora Karting',
};

/** Curated tracks that should always be selectable, in display order. */
export const KNOWN_KARTODROM_IDS = Object.keys(KARTODROM_LABELS);

/**
 * Known tracks (always shown) merged with any extra kartodrom ids found in the
 * data. Known ids keep their curated order; unknown ids are appended sorted.
 */
export function mergeKartodromOptions(fromDb: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of KNOWN_KARTODROM_IDS) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of [...fromDb].filter(Boolean).sort()) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function kartodromLabel(id: string): string {
  if (KARTODROM_LABELS[id]) return KARTODROM_LABELS[id];
  return id
    .split(/[-_]/)
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}
