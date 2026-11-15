import { defaultLoadout, pointsForLevel, type CharacterBuild } from '../character/build.js';
import type { Attributes, ClassId, GameConfig } from '../content/types.js';
import { Xoshiro128ss, type Seed } from '../random/prng.js';

export interface BotSpec {
  readonly id: string;
  readonly name: string;
  readonly classId: ClassId;
  readonly level: number;
  /** Bestimmt die leicht zufällige, aber reproduzierbare Punkteverteilung. */
  readonly seed: Seed;
}

/**
 * Baut einen computergesteuerten Charakter wie ein typischer Spieler: rund 60 % der freien
 * Punkte ins Hauptattribut, der Rest überwiegend in Konstitution, etwas Streuung; Standard-Loadout
 * und -Taktik der Klasse. Gleicher Seed, gleicher Build.
 */
export function botBuild(config: GameConfig, spec: BotSpec): CharacterBuild {
  const rng = Xoshiro128ss.fromSeed(spec.seed);
  const points = pointsForLevel(config, spec.level);
  const primary = config.classes[spec.classId].primary;

  const share = 550 + rng.nextInt(101); // 55–65 % ins Hauptattribut (Promille)
  const toPrimary = Math.floor((points * share) / 1000);
  const rest = points - toPrimary;
  const toSpread = Math.floor(rest / 4) - (rest >= 4 ? rng.nextInt(2) : 0);

  const allocated: Record<keyof Attributes, number> = { str: 0, dex: 0, int: 0, con: 0 };
  allocated[primary] += toPrimary;
  allocated.con += rest - toSpread;
  // Streupunkte landen in einem Nebenattribut (nicht Hauptattribut, nicht KON).
  const others = (['str', 'dex', 'int'] as const).filter((a) => a !== primary);
  allocated[others[rng.nextInt(others.length)]!] += toSpread;

  return {
    id: spec.id,
    name: spec.name,
    level: spec.level,
    classId: spec.classId,
    allocated,
    loadout: defaultLoadout(config, spec.classId, spec.level),
  };
}

/** Namen für Bot-Gegner; der Zusatz „Bot“ wird in der Oberfläche angezeigt. */
export const BOT_NAMES = [
  'Echo',
  'Rook',
  'Nyx',
  'Vanta',
  'Cipher',
  'Hex',
  'Static',
  'Torque',
  'Brass',
  'Flux',
  'Kilo',
  'Mira',
  'Sable',
  'Volt',
  'Onyx',
  'Juno',
] as const;
