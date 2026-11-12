import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { FightSummary } from '@tbca/shared';

import { LanguageService } from '../../core/language.service';

/** Eine Zeile im Kampfverlauf: Ergebnis, Gegner, Art, XP und Link zum Replay. */
@Component({
  selector: 'tbca-fight-row',
  imports: [TranslocoDirective, RouterLink],
  template: `
    <a class="fight" *transloco="let t" [routerLink]="['/replay', fight().id]">
      <span class="res" [attr.data-result]="result()">{{ t('fight.result.' + result()) }}</span>
      <span class="vs">
        {{ t('pvp.vs', { names: fight().opponents.join(', ') }) }} ·
        {{ t('replay.kind.' + fight().kind) }}
        @if (fight().xp > 0) {
          · <b>+{{ fight().xp }} XP</b>
        }
        @if (showDate()) {
          · {{ date() }}
        }
      </span>
      <span class="go">{{ t('fight.replay') }}</span>
    </a>
  `,
  styles: `
    :host {
      display: block;
    }
    .fight {
      display: grid;
      grid-template-columns: 80px minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      min-height: 48px;
      padding: 8px 22px;
      border-bottom: 1px solid rgb(255 255 255 / 0.05);
      text-decoration: none;
      color: var(--tbca-text-muted);
    }
    .fight:hover {
      background: rgb(0 240 255 / 0.04);
    }
    .res {
      font: 700 0.75rem / 1 var(--tbca-font-mono);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .res[data-result='won'] {
      color: var(--tbca-success);
    }
    .res[data-result='lost'] {
      color: var(--tbca-danger-text);
    }
    .res[data-result='draw'] {
      color: var(--tbca-neon-yellow);
    }
    .vs {
      font: 500 0.75rem / 1.4 var(--tbca-font-mono);
    }
    .vs b {
      color: var(--tbca-text-primary);
      font-weight: 500;
    }
    .go {
      font: 600 0.75rem / 1 var(--tbca-font-display);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--tbca-neon-cyan);
    }
  `,
})
export class FightRow {
  readonly fight = input.required<FightSummary>();
  readonly showDate = input(false);
  private readonly language = inject(LanguageService);

  protected result(): 'won' | 'lost' | 'draw' {
    const f = this.fight();
    return f.draw ? 'draw' : f.won ? 'won' : 'lost';
  }

  protected date(): string {
    return new Date(this.fight().createdAt).toLocaleString(this.language.current(), {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
