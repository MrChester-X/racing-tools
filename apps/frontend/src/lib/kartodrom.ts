const KARTODROM_LABELS: Record<string, string> = {
  'pitstop-premium': 'PitStop Premium',
  'pitstop-narvskaya': 'PitStop Narvskaya',
  'igora-karting': 'Igora Karting',
};

export function kartodromLabel(id: string): string {
  if (KARTODROM_LABELS[id]) return KARTODROM_LABELS[id];
  return id
    .split(/[-_]/)
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}
