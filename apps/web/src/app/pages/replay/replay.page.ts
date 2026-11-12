import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { ChallengeResponse, FightView, TeamChallengeResponse } from '@tbca/shared';

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
          <a class="tbca-button tbca-button--ghost" routerLink="/fight/arena">{{
            t('replay.back')
          }}</a>
        </section>
      } @else if (fight(); as f) {
        <header class="head">
          <a class="back tbca-idx" routerLink="/fight/history">← {{ t('fight.tabs.history') }}</a>
          <span class="tbca-kicker">{{ t('replay.kind.' + f.kind) }} · Replay</span>
          <h1 class="tbca-gl tbca-gl--e" [tbcaGlitch]="f.id">{{ title(f) }}</h1>
          <p class="outcome">
            @if (f.winner === null) {
              {{ t('replay.draw', { rounds: f.rounds }) }}
            } @else {
              {{
                t((f.teams[f.winner]?.length ?? 1) > 1 ? 'replay.winnerTeam' : 'replay.winner', {
                  name: teamName(f, f.winner),
                  rounds: f.rounds,
                })
              }}
            }
          </p>
          @if (result(); as r) {
            <p class="reward" role="status">
              @if (r.reward.rewarded) {
                {{ t('replay.reward', { xp: r.reward.xp, credits: r.reward.credits }) }}
                @if (r.level.after > r.level.before) {
                  <strong>{{ t('replay.levelUp', { level: r.level.after }) }}</strong>
                }
              } @else {
                {{ t('pvp.limit.' + r.reward.limit) }}
              }
            </p>
          }
        </header>
        @if (teamResult(); as tr) {
          <ul class="team-rewards" role="status">
            @for (r of tr.rewards; track r.name) {
              <li>
                <strong>{{ r.name }}</strong>
                @if (r.xp > 0) {
                  {{ t('replay.reward', { xp: r.xp, credits: r.credits }) }}
                } @else {
                  {{ t('pvp.limit.' + r.limit) }}
                }
                @if (r.levelUp) {
                  {{ t('replay.levelUp', { level: r.levelUp }) }}
                }
              </li>
            }
          </ul>
        }
        <tbca-replay-player [fight]="f" [ownTeam]="ownTeam()" />
        <div class="actions">
          <a class="tbca-button tbca-button--ghost" routerLink="/fight/arena">{{
            t('replay.back')
          }}</a>
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
      gap: 18px;
      max-width: 1440px;
      margin-inline: auto;
      padding: 24px clamp(16px, 3vw, 40px) 56px;
    }
    h1 {
      font: 700 clamp(1.6rem, 5vw, 2.5rem) / 1.05 var(--tbca-font-display);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .head {
      display: grid;
      gap: 8px;
      justify-items: start;
    }
    .back {
      text-decoration: none;
    }
    .outcome {
      font: 500 0.875rem / 1.4 var(--tbca-font-mono);
      color: var(--tbca-text-muted);
    }
    .reward {
      font: 600 var(--tbca-text-lg) / 1.3 var(--tbca-font-display);
      color: var(--tbca-neon-yellow);
      text-shadow: 0 0 12px rgb(245 228 0 / 0.35);
    }
    .reward strong {
      margin-left: var(--tbca-space-3);
      color: var(--tbca-neon-cyan);
    }
    .team-rewards {
      margin: 0;
      padding: 0;
      list-style: none;
      font: 500 0.8125rem / 1.5 var(--tbca-font-mono);
      color: var(--tbca-neon-yellow);
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
  protected readonly teamResult = signal<TeamChallengeResponse | null>(null);

  protected readonly ownTeam = computed(() => {
    const me = this.characters.state()?.id;
    const f = this.fight();
    const index = f?.teams.findIndex((team) => team.some((c) => c.id === me)) ?? -1;
    return index < 0 ? 0 : index;
  });

  constructor() {
    const state = this.document.defaultView?.history.state as {
      result?: ChallengeResponse;
      teamResult?: TeamChallengeResponse;
    } | null;
    if (state?.result) this.result.set(state.result);
    if (state?.teamResult) this.teamResult.set(state.teamResult);
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
