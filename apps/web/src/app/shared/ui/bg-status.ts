import { Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { PreferencesService } from '../../core/preferences.service';

/**
 * Einzeilige Diagnose des Hintergrunds unter der Grafikwahl: läuft er, mit wie vielen
 * Bildern pro Sekunde, hat „Auto“ gesenkt, oder steht er – und warum.
 */
@Component({
  selector: 'tbca-bg-status',
  imports: [TranslocoDirective],
  template: `
    <p class="diag" [class.diag--warn]="state().warn" *transloco="let t" aria-live="polite">
      {{ t('profile.bg.' + state().key, state().params) }}
    </p>
  `,
  styles: `
    .diag {
      margin: 0;
      font: 500 0.625rem / 1.45 var(--tbca-font-mono);
      letter-spacing: 0.04em;
      color: var(--tbca-text-muted);
    }
    .diag--warn {
      color: var(--tbca-neon-yellow);
    }
  `,
})
export class BgStatus {
  private readonly prefs = inject(PreferencesService);

  protected readonly state = computed(() => {
    const chosen = this.prefs.quality();
    const level = this.prefs.effectiveQuality();
    const stats = this.prefs.backgroundStats();
    if (level === 'niedrig') {
      const reduced = chosen === 'auto' && this.prefs.reducedMotion();
      return { key: reduced ? 'reduced' : 'still', params: {}, warn: reduced };
    }
    if (stats?.error) return { key: 'error', params: { error: stats.error }, warn: true };
    if (!stats) return { key: 'starting', params: {}, warn: false };
    if (stats.fps === 0) return { key: 'paused', params: {}, warn: true };
    const lowered = chosen === 'auto' && level !== 'hoch';
    const base = lowered ? `lowered_${level}` : 'running';
    return {
      key: stats.lost ? `${base}_lost` : base,
      params: { fps: stats.fps, ms: stats.cost.toFixed(1), lost: stats.lost },
      warn: stats.lost > 0,
    };
  });
}
