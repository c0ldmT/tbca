/**
 * Design-Tokens (Spezifikation, Abschnitt 18) für Code, der keine CSS-Variablen lesen kann,
 * z. B. three.js-Shader, Canvas oder SVG-Generatoren. Muss zu tokens.css passen;
 * ein Test prüft das.
 */
export const colors = {
  bgVoid: '#07080D',
  surface1: '#0F1220',
  surface2: '#171B2E',
  neonCyan: '#00F0FF',
  neonMagenta: '#FF2A6D',
  neonYellow: '#F5E400',
  textPrimary: '#E6EAF5',
  textMuted: '#8A93B2',
  line: '#262C47',
} as const;

/** Farben der Rarität-Tiers; Tier = aufgerundet (Rarität / 3). Tier 6+ ist holografisch. */
export const tierColors = {
  1: '#C9CED9',
  2: '#00F0FF',
  3: '#FFB000',
  4: '#B44CFF',
  5: '#FF3B3B',
  6: '#7DF9FF',
} as const;

export type Tier = keyof typeof tierColors;

/** Tier einer Rarität (1-basiert, nach oben offen; ab Tier 6 holografisch). */
export function tierOf(rarity: number): Tier {
  if (!Number.isInteger(rarity) || rarity < 1) throw new RangeError(`Ungültige Rarität: ${rarity}`);
  return Math.min(6, Math.ceil(rarity / 3)) as Tier;
}

export const fonts = {
  display: "'Chakra Petch', 'Segoe UI', system-ui, sans-serif",
  body: "'Inter Variable', 'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
} as const;

export const motion = {
  /** Obergrenze für Glitch-Effekte. */
  glitchMs: 300,
  fastMs: 120,
  baseMs: 200,
} as const;

/** Mindestgröße für Touch-Ziele in Pixeln. */
export const touchTargetPx = 44;
