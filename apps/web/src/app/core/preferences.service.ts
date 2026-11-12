import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

/** Grafikstufen (Spezifikation, Abschnitt 18); „auto“ wählt nach Gerät. */
export const QUALITIES = ['auto', 'hoch', 'mittel', 'niedrig'] as const;
export type Quality = (typeof QUALITIES)[number];
/** Wirksame Stufe; „sparsam“ wählt nur Auto, wenn selbst „mittel“ zu langsam zeichnet. */
export type EffectiveQuality = Exclude<Quality, 'auto'> | 'sparsam';

/** Laufzeitwerte des Hintergrunds für die Diagnose. */
export interface BackgroundStats {
  fps: number;
  cost: number;
  error: string | null;
  /** Wie oft der Grafikkontext verloren ging und neu aufgebaut wurde. */
  lost: number;
}

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

  /** Wie oft der Hintergrund gemessen zu langsam war (0–2); senkt nur die Auto-Stufe. */
  readonly slowSteps = signal(0);
  /** Zuletzt gemeldete Laufzeitwerte des Hintergrunds (null = noch keine). */
  readonly backgroundStats = signal<BackgroundStats | null>(null);

  /**
   * Eine ausdrücklich gewählte Stufe gilt immer. „Auto“ startet auf Hoch und senkt erst nach
   * gemessener Langsamkeit ab (Hoch → Mittel → Sparsam, nie bis zum Standbild) – die gemeldeten
   * CPU-Kerne taugen dafür nicht, weil viele Browser sie aus Datenschutzgründen verfälschen.
   * Nur bei reduzierter Bewegung im System steht der Hintergrund unter „Auto“ still.
   */
  readonly effectiveQuality = computed<EffectiveQuality>(() => {
    const chosen = this.quality();
    if (chosen !== 'auto') return chosen;
    if (this.reducedMotion()) return 'niedrig';
    const nav = this.window?.navigator as
      (Navigator & { connection?: { saveData?: boolean } }) | undefined;
    const start = nav?.connection?.saveData ? 1 : 0;
    const steps = start + this.slowSteps();
    return steps >= 2 ? 'sparsam' : steps === 1 ? 'mittel' : 'hoch';
  });

  /** Vom Hintergrund gemeldet: Zeichnen dauerhaft zu langsam. */
  reportSlow(): void {
    if (this.quality() === 'auto') this.slowSteps.update((n) => Math.min(2, n + 1));
  }

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
