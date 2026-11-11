import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { colors, motion, tierColors, tierOf } from '../src/index.js';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');

function cssVar(name: string): string | undefined {
  return new RegExp(`--tbca-${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
}

const kebab = (s: string) => s.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();

describe('Design-Tokens', () => {
  it('stimmen zwischen tokens.ts und tokens.css überein', () => {
    for (const [key, value] of Object.entries(colors)) {
      expect(cssVar(kebab(key)), key).toBe(value.toLowerCase());
    }
    for (const [tier, value] of Object.entries(tierColors)) {
      expect(cssVar(`tier-${tier}`), `tier ${tier}`).toBe(value.toLowerCase());
    }
    expect(cssVar('glitch-ms')).toBe(`${motion.glitchMs}ms`);
  });

  it('ordnet Raritäten den Tiers zu', () => {
    expect([1, 3, 4, 6, 7, 9, 10, 12, 13, 15, 16, 20].map(tierOf)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    ]);
    expect(() => tierOf(0)).toThrow(RangeError);
  });

  it('hält den Textkontrast nach WCAG AA ein', () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    for (const bg of [colors.bgVoid, colors.surface1, colors.surface2]) {
      for (const fg of [
        colors.textPrimary,
        colors.textMuted,
        colors.neonCyan,
        colors.neonMagenta,
      ]) {
        expect(contrast(fg, bg), `${fg} auf ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
