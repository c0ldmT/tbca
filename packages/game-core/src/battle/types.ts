import type { Fixed } from '../math/fixed.js';
import type { Seed } from '../random/prng.js';

/** Schadensart: physisch wird von Rüstung, Tech von Firewall gemindert. */
export type DamageKind = 'physical' | 'tech';

/**
 * Momentaufnahme eines Kämpfers zum Kampfbeginn.
 *
 * Enthält ausschließlich bereits abgeleitete Kampfwerte. Die Ableitung aus Attributen,
 * Klasse und Ausrüstung geschieht vorher; die Engine kennt weder Datenbank noch Items.
 * Alle Zahlen sind ganzzahlig (Festkomma, wo angegeben).
 */
export interface CombatantSnapshot {
  /** Eindeutig innerhalb des Kampfes, z. B. die Charakter-ID. */
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly stats: {
    readonly maxHp: number;
    /** Abwehr gegen physischen Schaden. */
    readonly armor: number;
    /** Abwehr gegen Tech-Schaden. */
    readonly firewall: number;
    /** Füllt die Initiative-Leiste pro Tick; mindestens 1. */
    readonly initiative: number;
    readonly accuracy: number;
    readonly evasion: number;
    /** Crit-Chance in Promille (0–1000). */
    readonly critChance: number;
    /** Crit-Schaden als Festkomma-Multiplikator (15 000 = ×1,5). */
    readonly critDamage: Fixed;
    /** Bedrohung für die Zielwahl der Gegner; Standard 100. */
    readonly threat?: number;
  };
  /** Basisangriff (Waffe). */
  readonly attack: {
    readonly kind: DamageKind;
    /** Waffen-Grundschaden W. */
    readonly base: number;
    /** Wert des skalierenden Attributs A. */
    readonly attribute: number;
    /** Skalierungsfaktor s als Festkomma. */
    readonly scaling: Fixed;
  };
}

/**
 * Regelwerte des Kampfes. Spielwerte sind Daten: In Produktion kommen sie aus der
 * versionierten Season-Konfiguration; DEFAULT_BATTLE_RULES sind die Startwerte.
 */
export interface BattleRules {
  /** Initiative-Punkte, ab denen ein Kämpfer handelt. */
  readonly actionThreshold: number;
  /** Ticks pro Runde. Ein Kämpfer mit Initiative actionThreshold/ticksPerRound handelt 1× pro Runde. */
  readonly ticksPerRound: number;
  /** Basis-Trefferchance (Festkomma). */
  readonly baseHitChance: Fixed;
  /** Differenz Genauigkeit − Ausweichen, die 100 % Trefferchance entspricht. */
  readonly hitChanceDivisor: number;
  readonly minHitChance: Fixed;
  readonly maxHitChance: Fixed;
  /** Varianz des Schadens als Festkomma-Bereich [min, max]. */
  readonly varianceMin: Fixed;
  readonly varianceMax: Fixed;
  /** Konstante K der Abwehrformel D / (D + K · L). */
  readonly defenseConstant: number;
  /** Ab dieser Runde steigt der Schaden (Sudden Death). */
  readonly suddenDeathRound: number;
  /** Schadenszuwachs pro Sudden-Death-Runde (Festkomma). */
  readonly suddenDeathStep: Fixed;
  /** Harte Obergrenze; danach entscheidet der prozentuale HP-Rest. */
  readonly maxRounds: number;
}

export interface BattleInput {
  readonly engineVersion: number;
  /** Version der Season-Konfiguration, aus der Regeln und Momentaufnahmen stammen. */
  readonly configVersion: number;
  readonly seed: Seed;
  /** Fehlt der Wert, gelten DEFAULT_BATTLE_RULES. */
  readonly rules?: BattleRules;
  /** Zwei oder mehr Teams mit je mindestens einem Kämpfer (1v1, 2v2, 5–10 gegen Boss …). */
  readonly teams: readonly (readonly CombatantSnapshot[])[];
}

export type BattleEvent =
  | {
      readonly type: 'start';
      readonly tick: 0;
      readonly round: 1;
      readonly combatants: readonly {
        readonly id: string;
        readonly team: number;
        readonly hp: number;
      }[];
    }
  | { readonly type: 'round'; readonly tick: number; readonly round: number }
  | {
      readonly type: 'sudden_death';
      readonly tick: number;
      readonly round: number;
      /** Aktueller Schadensmultiplikator (Festkomma). */
      readonly multiplier: Fixed;
    }
  | {
      readonly type: 'action';
      readonly tick: number;
      readonly round: number;
      readonly action: 'basic_attack';
      readonly source: string;
      readonly target: string;
      readonly outcome: 'hit' | 'miss';
      /** Verursachter Schaden (0 bei Fehlschlag). */
      readonly value: number;
      /** Verbleibende HP des Ziels. */
      readonly targetHp: number;
      readonly effects: readonly 'crit'[];
    }
  | { readonly type: 'defeat'; readonly tick: number; readonly round: number; readonly id: string }
  | {
      readonly type: 'end';
      readonly tick: number;
      readonly round: number;
      readonly winner: number | null;
      readonly reason: BattleEndReason;
    };

/** knockout: nur ein Team steht noch; timeout: maxRounds erreicht, HP-Rest entscheidet. */
export type BattleEndReason = 'knockout' | 'timeout';

export interface BattleResult {
  readonly engineVersion: number;
  readonly configVersion: number;
  /** Index des siegreichen Teams oder null bei Unentschieden. */
  readonly winner: number | null;
  readonly reason: BattleEndReason;
  readonly rounds: number;
  readonly ticks: number;
  readonly survivors: readonly { readonly id: string; readonly hp: number }[];
  readonly events: readonly BattleEvent[];
  /** Fingerabdruck des Event-Logs, z. B. zur Prüfung gespeicherter Replays. */
  readonly logHash: string;
}
