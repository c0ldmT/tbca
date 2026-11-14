import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { ChallengeResponse, FightView } from '@tbca/shared';

import { ApiFailure } from '../../core/api-failure';
import { CharacterService } from '../../core/character.service';
import { PvpService } from '../../core/pvp.service';
import { GlitchDirective } from '../../shared/glitch.directive';
import { ReplayPlayer } from './replay-player';

@Component({
  selector: 'tbca-replay-page',
  imports: [TranslocoDirective, RouterLink, ReplayPlayer, GlitchDirective],
  template: `
    <ng-container *transloco="let t">
      @if (error()) {
        <section class="tbca-panel">
          <p class="tbca-error" role="alert">{{ t('errors.' + error()) }}</p>
          <a class="tbca-button tbca-button--ghost" routerLink="/pvp">{{ t('replay.back') }}</a>
        </section>
      } @else if (fight(); as f) {
        <header class="head">
          <h1 [tbcaGlitch]="f.id">{{ title(f) }}</h1>
          <p class="tbca-hint">{{ t('replay.kind.' + f.kind) }}</p>
          <p>
            @if (f.winner === null) {
              {{ t('replay.draw', { rounds: f.rounds }) }}
            } @else {
              {{ t('replay.winner', { name: teamName(f, f.winner), rounds: f.rounds }) }}
            }
          </p>
          @if (result(); as r) {
            <p class="reward" role="status">
              @if (r.reward.rewarded) {
                {{ t('replay.reward', { xp: r.reward.xp }) }}
                @if (r.level.after > r.level.before) {
                  <strong>{{ t('replay.levelUp', { level: r.level.after }) }}</strong>
                }
              } @else {
                {{ t('pvp.limit.' + r.reward.limit) }}
              }
            </p>
          }
        </header>
        <section class="tbca-panel">
          <tbca-replay-player [fight]="f" [ownTeam]="ownTeam()" />
        </section>
        <div class="actions">
          <a class="tbca-button tbca-button--ghost" routerLink="/pvp">{{ t('replay.back') }}</a>
          <button type="button" class="tbca-button tbca-button--ghost" (click)="copyLink()">
            {{ copied() ? t('replay.copied') : t('replay.share') }}
          </button>
        </div>
      } @else {
        <p class="tbca-hint" aria-live="polite">{{ t('replay.loading') }}</p>
      }
    </ng-container>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--tbca-space-6);
      width: min(100%, 72rem);
      margin-inline: auto;
      padding: var(--tbca-space-8) clamp(var(--tbca-space-4), 4vw, var(--tbca-space-12));
    }
    h1 {
      font-size: clamp(1.6rem, 6vw, 2.6rem);
    }
    .head {
      display: grid;
      gap: var(--tbca-space-2);
    }
    .reward {
      font: 600 var(--tbca-text-lg) / 1.3 var(--tbca-font-display);
      color: var(--tbca-neon-yellow);
    }
    .reward strong {
      margin-left: var(--tbca-space-3);
      color: var(--tbca-neon-cyan);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tbca-space-3);
    }
  `,
})
export class ReplayPage {
  private readonly pvp = inject(PvpService);
  private readonly characters = inject(CharacterService);
  private readonly document = inject(DOCUMENT);

  /** Routenparameter :id */
  readonly id = input.required<string>();

  protected readonly fight = signal<FightView | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly copied = signal(false);
  /** Ergebnis der eigenen Herausforderung, falls die Seite direkt danach geöffnet wurde. */
  protected readonly result = signal<ChallengeResponse | null>(null);

  protected readonly ownTeam = computed(() => {
    const me = this.characters.state()?.id;
    const f = this.fight();
    const index = f?.teams.findIndex((team) => team.some((c) => c.id === me)) ?? -1;
    return index < 0 ? 0 : index;
  });

  constructor() {
    const state = this.document.defaultView?.history.state as { result?: ChallengeResponse } | null;
    if (state?.result) this.result.set(state.result);
    effect(() => void this.load(this.id()));
  }

  protected title(f: FightView): string {
    return f.teams.map((team) => team.map((c) => c.name).join(' + ')).join(' vs ');
  }

  protected teamName(f: FightView, team: number): string {
    return f.teams[team]?.map((c) => c.name).join(', ') ?? '';
  }

  protected async copyLink(): Promise<void> {
    try {
      await this.document.defaultView?.navigator.clipboard.writeText(this.document.location.href);
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  private async load(id: string): Promise<void> {
    this.fight.set(null);
    this.error.set(null);
    try {
      this.fight.set(await this.pvp.fight(id));
      if (this.characters.state() === undefined)
        await this.characters.refresh().catch(() => undefined);
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    }
  }
}
