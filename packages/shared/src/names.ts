/**
 * Regeln für Charakternamen (Spezifikation, Abschnitt 4): global eindeutig je Season,
 * 3–20 Zeichen, Wortfilter. Ohne Laufzeitabhängigkeiten, damit Website und API dieselbe
 * Prüfung nutzen (`@tbca/shared/names`).
 */

export const NAME_MIN_LENGTH = 3;
export const NAME_MAX_LENGTH = 20;

/** Buchstaben (inkl. Umlaute), Ziffern, Leerzeichen, Punkt, Binde- und Unterstrich. */
const NAME_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N}._-]| (?! ))*[\p{L}\p{N}]$/u;

/**
 * Gesperrte Wortstämme. Bewusst klein: reservierte Namen und offensichtliche Fälle.
 * Erweiterungen pflegt später der Admin-Bereich in der Konfiguration.
 */
const BLOCKED = [
  'admin',
  'moderator',
  'support',
  'system',
  'tbca',
  'discord',
  'twitch',
  'nazi',
  'hitler',
  'fuck',
  'fick',
  'hure',
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

export type NameProblem = 'too_short' | 'too_long' | 'invalid_characters' | 'blocked';

/** Normalisiert einen Namen für Vergleich und Filter (Kleinbuchstaben, Leetspeak, ohne Trenner). */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/[ ._-]/g, '');
}

/** null, wenn der Name zulässig ist; sonst der Grund. */
export function checkName(raw: string): NameProblem | null {
  const name = raw.trim();
  const length = [...name].length;
  if (length < NAME_MIN_LENGTH) return 'too_short';
  if (length > NAME_MAX_LENGTH) return 'too_long';
  if (!NAME_PATTERN.test(name)) return 'invalid_characters';
  const normalized = normalizeName(name);
  if (BLOCKED.some((word) => normalized.includes(word))) return 'blocked';
  return null;
}
