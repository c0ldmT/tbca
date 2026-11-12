import { DOCUMENT } from '@angular/common';
import type { ElementRef } from '@angular/core';
import {
  Component,
  afterNextRender,
  effect,
  inject,
  input,
  viewChild,
  type OnDestroy,
} from '@angular/core';

import { PreferencesService } from '../../core/preferences.service';
import { RainCity } from './city-renderer';

/**
 * Hintergrund aller Seiten: ruhige Regenstadt hinter einem Schleier für Lesbarkeit und feinen
 * Scanlines. Folgt der Grafikstufe; pausiert, wenn der Tab im Hintergrund ist.
 */
@Component({
  selector: 'tbca-city-rain',
  template: `
    <canvas #canvas class="city"></canvas>
    <div class="veil" [style.--dim]="dim()"></div>
    <div class="scan"></div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background: #05060b;
    }
    .city,
    .veil,
    .scan {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .veil {
      background: linear-gradient(
        180deg,
        rgb(7 8 13 / calc(var(--dim) + 0.25)) 0%,
        rgb(7 8 13 / var(--dim)) 45%,
        rgb(7 8 13 / calc(var(--dim) * 0.6)) 100%
      );
    }
    .scan {
      background: repeating-linear-gradient(
        to bottom,
        rgb(255 255 255 / 0.018) 0 1px,
        transparent 1px 3px
      );
    }
  `,
  host: { 'aria-hidden': 'true' },
})
export class CityRain implements OnDestroy {
  private readonly prefs = inject(PreferencesService);
  private readonly document = inject(DOCUMENT);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  /** Abdunkelung für Lesbarkeit (0–0,8). */
  readonly dim = input(0.2);
  readonly seed = input(7);

  private city: RainCity | null = null;
  private observer: ResizeObserver | null = null;
  private readonly onVisibility = () => {
    if (!this.city) return;
    if (this.document.hidden) this.city.stop();
    else this.city.start();
  };

  constructor() {
    afterNextRender(() => {
      const el = this.canvas().nativeElement;
      // Ohne Canvas-Unterstützung (z. B. in Tests) bleibt der dunkle Hintergrund.
      if (!el.getContext?.('2d')) return;
      this.city = new RainCity(el, this.seed());
      this.city.onSlow = () => this.prefs.reportSlow();
      this.city.setQuality(this.prefs.effectiveQuality());
      this.city.resize(true);
      if (typeof ResizeObserver !== 'undefined') {
        this.observer = new ResizeObserver(() => this.city?.resize());
        this.observer.observe(el);
      }
      this.document.addEventListener('visibilitychange', this.onVisibility);
    });
    effect(() => {
      const quality = this.prefs.effectiveQuality();
      this.city?.setQuality(quality);
    });
  }

  ngOnDestroy(): void {
    this.city?.stop();
    this.observer?.disconnect();
    this.document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
