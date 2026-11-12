import { Component, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { FightSummary } from '@tbca/shared';

import { ApiFailure } from '../../core/api-failure';
import { PvpService } from '../../core/pvp.service';
import { FightRow } from './fight-row';

/** Verlauf: alle eigenen letzten Kämpfe mit Replay. */
@Component({
  selector: 'tbca-history-page',
  imports: [TranslocoDirective, FightRow],
  template: `
    <section
      class="tbca-panel tbca-panel--flush tbca-gl tbca-gl--a"
      *transloco="let t"
      aria-labelledby="hi-t"
    >
      <i class="tbca-gx" aria-hidden="true"></i>
      <div class="tbca-ph">
        <h2 id="hi-t">{{ t('fight.tabs.history') }}</h2>
        <span class="tbca-idx">{{ t('fight.historyTag') }}</span>
      </div>
      @if (error()) {
        <p class="tbca-error pad" role="alert">{{ t('errors.' + error()) }}</p>
      }
      @if (fights(); as list) {
        @for (f of list; track f.id) {
          <tbca-fight-row [fight]="f" [showDate]="true" />
        } @empty {
          <p class="tbca-hint pad">{{ t('pvp.noFights') }}</p>
        }
      } @else {
        <p class="tbca-hint pad">{{ t('pvp.loading') }}</p>
      }
    </section>
  `,
  styles: `
    .pad {
      padding: 16px 22px;
    }
  `,
})
export class HistoryPage {
  private readonly pvp = inject(PvpService);
  protected readonly fights = signal<FightSummary[] | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.pvp.recent().then(
      (list) => this.fights.set(list),
      (error: unknown) => this.error.set(error instanceof ApiFailure ? error.code : 'unknown'),
    );
  }
}
