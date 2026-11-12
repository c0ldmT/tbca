/**
 * Wiederkehrende Jobs. Die Logik liegt in der API (interne Endpunkte); der Worker plant sie mit
 * BullMQ, damit jeder Job genau einmal läuft – auch mit mehreren Worker-Prozessen.
 */
export interface JobDefinition {
  name: string;
  /** Abstand in Millisekunden (Echtzeit). */
  everyMs: number;
  /** Pfad unter /api/internal/jobs/ */
  path: string;
}

export const JOBS: readonly JobDefinition[] = [
  { name: 'expire-dungeon-runs', everyMs: 60_000, path: 'expire-dungeon-runs' },
  // Aktivitäts-XP aus dem Chat gebündelt buchen (Spezifikation, Abschnitt 15)
  { name: 'flush-passive-xp', everyMs: 30_000, path: 'flush-passive-xp' },
  { name: 'cleanup-sessions', everyMs: 60 * 60_000, path: 'cleanup-sessions' },
  // Median-Level der Season für den Aufholbonus
  { name: 'season-stats', everyMs: 10 * 60_000, path: 'season-stats' },
  // Bot-Spieler handeln nur in Test-Seasons; in echten Seasons antwortet die API mit „übersprungen“.
  { name: 'bot-agents', everyMs: 5 * 60_000, path: 'bot-agents' },
];

/** Führt einen Job aus, indem er den internen Endpunkt der API aufruft. */
export async function runJob(
  job: JobDefinition,
  api: { url: string; token: string },
  fetchFn: typeof fetch = fetch,
): Promise<unknown> {
  const res = await fetchFn(`${api.url}/internal/jobs/${job.path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${api.token}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Job ${job.name} fehlgeschlagen: HTTP ${res.status}`);
  return res.json();
}
