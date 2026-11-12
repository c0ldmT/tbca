import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

/** Grafikstufen (Spezifikation, Abschnitt 18); „auto“ wählt nach Gerät. */
export const QUALITIES = ['auto', 'hoch', 'mittel', 'niedrig'] as const;
export type Quality = (typeof QUALITIES)[number];
export type EffectiveQuality = Exclude<Quality, 'auto'>;

const QUALITY_KEY = 'tbca.quality';
const SOUND_KEY = 'tbca.sound';

/**
 * Darstellung und Ton, je Gerät im Browser gespeichert. Die wirksame Stufe steht zusätzlich
 * als `data-quality` am Wurzelelement, damit CSS Effekte abschalten kann.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;

  readonly quality = signal<Quality>(this.read(QUALITY_KEY, QUALITIES, 'auto'));
  readonly sound = signal<boolean>(this.read(SOUND_KEY, ['an', 'aus'], 'an') === 'an');
  readonly reducedMotion = signal(
    this.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );

  readonly effectiveQuality = computed<EffectiveQuality>(() => {
    if (this.reducedMotion()) return 'niedrig';
    const chosen = this.quality();
    if (chosen !== 'auto') return chosen;
    const nav = this.window?.navigator as (Navigator & { deviceMemory?: number }) | undefined;
    const cores = nav?.hardwareConcurrency ?? 4;
    const memory = nav?.deviceMemory ?? 4;
    if (cores <= 2 || memory <= 2) return 'niedrig';
    if (cores <= 4 || memory <= 4) return 'mittel';
    return 'hoch';
  });

  constructor() {
    this.window
      ?.matchMedia?.('(prefers-reduced-motion: reduce)')
      .addEventListener?.('change', (e) => this.reducedMotion.set(e.matches));
    effect(() => {
      this.document.documentElement.dataset['quality'] = this.effectiveQuality();
    });
  }

  setQuality(quality: Quality): void {
    this.quality.set(quality);
    this.write(QUALITY_KEY, quality);
  }

  setSound(on: boolean): void {
    this.sound.set(on);
    this.write(SOUND_KEY, on ? 'an' : 'aus');
  }

  private read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    try {
      const value = this.window?.localStorage.getItem(key);
      return allowed.find((a) => a === value) ?? fallback;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.window?.localStorage.setItem(key, value);
    } catch {
      // Speicher nicht verfügbar – Wahl gilt nur für diese Sitzung.
    }
  }
}
