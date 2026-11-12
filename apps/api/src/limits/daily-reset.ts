import { character, dailyReset } from '@tbca/db';
import { sql, type SQL } from 'drizzle-orm';

export type DailyResetKind = 'dungeon' | 'fights';

/**
 * Zeitpunkt der jüngsten Admin-Rücksetzung eines Tageslimits für den Charakter – eigene
 * Einträge und solche für die ganze Season. Ohne Rücksetzung `-infinity`, damit ein
 * Vergleich `created_at > …` alle Einträge des Tages mitzählt.
 */
export function resetSince(kind: DailyResetKind, characterId: string, day: string): SQL<Date> {
  return sql<Date>`coalesce((
    select max(${dailyReset.createdAt}) from ${dailyReset}
    where ${dailyReset.kind} = ${kind} and ${dailyReset.day} = ${day}
      and (${dailyReset.characterId} = ${characterId}
        or (${dailyReset.characterId} is null and ${dailyReset.seasonId} =
          (select ${character.seasonId} from ${character} where ${character.id} = ${characterId})))
  ), '-infinity'::timestamptz)`;
}
