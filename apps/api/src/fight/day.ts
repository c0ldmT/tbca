/** Kalendertag (YYYY-MM-DD) eines Zeitpunkts in der Spielzeitzone, z. B. für Tageslimits. */
export function dayKey(ms: number, timeZone: string): string {
  // en-CA formatiert als YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ms);
}
