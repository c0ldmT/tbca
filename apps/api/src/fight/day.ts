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

/**
 * Zeitpunkt einer Uhrzeit an einem Kalendertag (YYYY-MM-DD) in der Spielzeitzone, z. B. der
 * Liga-Spieltag um 20:00 Europe/Berlin. Sommer- und Winterzeit werden berücksichtigt.
 */
export function zonedTime(day: string, hour: number, minute: number, timeZone: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  // Zweimal korrigieren: einmal für den Versatz, einmal falls er am Ergebnis anders ist (DST)
  let at = guess - offsetMs(guess, timeZone);
  at = guess - offsetMs(at, timeZone);
  return at;
}

/** Kalendertag + n Tage (YYYY-MM-DD). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Versatz der Zeitzone gegenüber UTC zu einem Zeitpunkt in Millisekunden. */
function offsetMs(ms: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(ms)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts['year']),
    Number(parts['month']) - 1,
    Number(parts['day']),
    Number(parts['hour']),
    Number(parts['minute']),
    Number(parts['second']),
  );
  return asUtc - (ms - (ms % 1000));
}
