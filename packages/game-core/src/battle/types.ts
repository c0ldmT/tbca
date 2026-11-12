import type {
  AbilityDef,
  Affinity,
  Attributes,
  ClassId,
  DamageKind,
  Modifiers,
  StatusKind,
  TacticRule,
} from '../content/types.js';
import type { Fixed } from '../math/fixed.js';
import type { Seed } from '../random/prng.js';

export type { DamageKind } from '../content/types.js';

/**
 * Momentaufnahme eines Kämpfers zum Kampfbeginn.
 *
 * Enthält alles, was der Kampf braucht – abgeleitete Werte, Fähigkeiten und Taktikregeln –
 * aber keine Verweise auf Konfiguration oder Datenbank. So bleibt ein gespeicherter Kampf
 * auch nach Balancing-Änderungen exakt reproduzierbar.
 */
export interface CombatantSnapshot {
  /** Eindeutig innerhalb des Kampfes, z. B. die Charakter-ID. */
  readonly id: string;
  readonly name: string;
  readonly level: number;
  /** null für Monster. */
  readonly classId: ClassId | null;
  readonly role: 'tank' | 'damage' | 'support';
  readonly affinity: Affinity;
  readonly attributes: Attributes;
  readonly stats: {
    readonly maxHp: number;
    readonly armor: number;
    readonly firewall: number;
    /** Füllt die Initiative-Leiste pro Tick; mindestens 1. */
    readonly initiative: number;
    readonly accuracy: number;
    readonly evasion: number;
    /** Crit-Chance in Promille (0–1000). */
    readonly critChance: number;
    /** Crit-Schaden als Festkomma-Multiplikator (15 000 = ×1,5). */
    readonly critDamage: Fixed;
    /** Bedrohung für die Zielwahl der Gegner. */
    readonly threat: number;
    readonly energyMax: number;
    readonly energyStart: number;
    /** Energie, die vor jeder eigenen Aktion hinzukommt. */
    readonly energyRegen: number;
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
  /** Dauerhafte Werte, z. B. aus dem Klassen-Passiv. */
  readonly modifiers: Modifiers;
  /** Aktive Fähigkeiten im Loadout (vollständige Definitionen). */
  readonly abilities: readonly AbilityDef[];
  readonly tactics: readonly TacticRule[];
}

/**
 * Regelwerte des Kampfes. Spielwerte sind Daten: In Produktion kommen sie aus der
 * versionierten Season-Konfiguration; DEFAULT_BATTLE_RULES sind die Startwerte.
 */
export interface BattleRules {
  /** Initiative-Punkte, ab denen ein Kämpfer handelt. */
  readonly actionThreshold: number;
  /** Ticks pro Runde. */
  readonly ticksPerRound: number;
  readonly baseHitChance: Fixed;
  /** Differenz Genauigkeit − Ausweichen, die 100 % Trefferchance entspricht. */
  readonly hitChanceDivisor: number;
  readonly minHitChance: Fixed;
  readonly maxHitChance: Fixed;
  readonly varianceMin: Fixed;
  readonly varianceMax: Fixed;
  /** Konstante K der Abwehrformel D / (D + K · L). */
  readonly defenseConstant: number;
  readonly suddenDeathRound: number;
  readonly suddenDeathStep: Fixed;
  readonly maxRounds: number;
  /** Bonus im Attributs-Dreieck (Festkomma-Delta). */
  readonly triangleBonus: Fixed;
}

export interface BattleInput {
  readonly engineVersion: number;
  /** Version der Season-Konfiguration, aus der Regeln und Momentaufnahmen stammen. */
  readonly configVersion: number;
  readonly seed: Seed;
  /** Fehlt der Wert, gelten DEFAULT_BATTLE_RULES. */
  readonly rules?: BattleRules;
  /** Zwei oder mehr Teams mit je mindestens einem Kämpfer. */
  readonly teams: readonly (readonly CombatantSnapshot[])[];
}

interface At {
  readonly tick: number;
  readonly round: number;
}

/**
 * Flaches Event-Log für Replays, Chat-Zusammenfassungen und Screenreader-Text.
 * Jede Aktion erzeugt ein `action`-Event, gefolgt von ihren Auswirkungen.
 */
export type BattleEvent =
  | {
      readonly type: 'start';
      readonly tick: 0;
      readonly round: 1;
      readonly combatants: readonly {
        readonly id: string;
        readonly team: number;
        readonly hp: number;
        readonly energy: number;
      }[];
    }
  | ({ readonly type: 'round' } & At)
  | ({ readonly type: 'sudden_death'; readonly multiplier: Fixed } & At)
  | ({
      readonly type: 'action';
      readonly source: string;
      /** Fähigkeits-ID oder 'basic_attack'. */
      readonly ability: string;
      /** Energie nach Abzug der Kosten. */
      readonly energy: number;
    } & At)
  | ({ readonly type: 'stunned'; readonly id: string } & At)
  | ({
      readonly type: 'damage';
      readonly source: string;
      readonly target: string;
      readonly value: number;
      /** Vom Schild aufgefangener Anteil. */
      readonly absorbed: number;
      readonly hp: number;
      readonly crit: boolean;
      /** Schaden über Zeit statt direkter Treffer. */
      readonly dot: boolean;
    } & At)
  | ({ readonly type: 'miss'; readonly source: string; readonly target: string } & At)
  | ({
      readonly type: 'heal';
      readonly source: string;
      readonly target: string;
      readonly value: number;
      readonly hp: number;
    } & At)
  | ({
      readonly type: 'status';
      readonly source: string;
      readonly target: string;
      readonly status: StatusKind;
      readonly turns: number;
      /** Schildstärke bzw. Schaden pro Zug, sonst 0. */
      readonly value: number;
    } & At)
  | ({ readonly type: 'resist'; readonly target: string; readonly status: StatusKind } & At)
  | ({
      readonly type: 'energy';
      readonly source: string;
      readonly target: string;
      /** Entzogene Energie. */
      readonly value: number;
    } & At)
  | ({ readonly type: 'cleanse'; readonly target: string; readonly removed: number } & At)
  | ({ readonly type: 'defeat'; readonly id: string } & At)
  | ({
      readonly type: 'end';
      readonly winner: number | null;
      readonly reason: BattleEndReason;
    } & At);

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
