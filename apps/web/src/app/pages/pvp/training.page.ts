import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { CLASS_IDS, type ClassId } from '@tbca/game-core';

import { ApiFailure } from '../../core/api-failure';
import { CharacterService } from '../../core/character.service';
import { PvpService } from '../../core/pvp.service';
import { ClassBadge } from '../../shared/ui/class-badge';

/** Training: Kampf gegen einen Computer-Gegner ohne Belohnung, zum Testen von Build und Taktik. */
@Component({
  selector: 'tbca-training-page',
  imports: [TranslocoDirective, ClassBadge],
  template: `
    <section
      class="tbca-panel tbca-panel--flush tbca-gl tbca-gl--c"
      *transloco="let t"
      aria-labelledby="tr-t"
    >
      <i class="tbca-gx" aria-hidden="true"></i>
      <div class="tbca-ph">
        <h2 id="tr-t">{{ t('pvp.training.title') }}</h2>
        <span class="tbca-idx">{{ t('fight.trainingTag') }}</span>
      </div>
      <div class="body">
        <p class="tbca-hint">{{ t('pvp.training.intro') }}</p>
        <div class="classes" role="radiogroup" [attr.aria-label]="t('pvp.training.class')">
          @for (id of classIds; track id) {
            <button
              type="button"
              role="radio"
              class="cl"
              [attr.aria-checked]="cls() === id"
              (click)="cls.set(id)"
            >
              <tbca-class-badge [classId]="id" [size]="40" />
              {{ t('classes.' + id) }}
            </button>
          }
        </div>
        <div class="row">
          <label class="tbca-label">
            {{ t('pvp.training.level') }}
            <input
              class="tbca-input lvl"
              type="number"
              min="1"
              max="100"
              [value]="level()"
              (change)="setLevel($any($event.target).value)"
            />
          </label>
          <button
            type="button"
            class="tbca-button tbca-button--lg"
            [disabled]="busy()"
            (click)="train()"
          >
            {{ t('pvp.training.start') }}
          </button>
        </div>
        @if (error()) {
          <p class="tbca-error" role="alert">{{ t('errors.' + error()) }}</p>
        }
      </div>
    </section>
  `,
  styles: `
    .body {
      display: grid;
      gap: 16px;
      padding: 18px 22px 22px;
    }
    .classes {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 10px;
    }
    .cl {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 56px;
      padding: 8px 14px;
      background: rgb(7 8 13 / 0.5);
      border: 1px solid rgb(255 255 255 / 0.1);
      font: 600 1rem / 1 var(--tbca-font-display);
      cursor: pointer;
    }
    .cl[aria-checked='true'] {
      border-color: var(--tbca-neon-cyan);
      box-shadow:
        0 0 0 1px var(--tbca-neon-cyan),
        0 0 20px rgb(0 240 255 / 0.3);
      background: rgb(0 240 255 / 0.06);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: 14px;
    }
    .lvl {
      width: 120px;
    }
  `,
})
export class TrainingPage {
  private readonly pvp = inject(PvpService);
  private readonly router = inject(Router);

  protected readonly classIds = CLASS_IDS;
  protected readonly cls = signal<ClassId>('bruiser');
  protected readonly level = signal(inject(CharacterService).state()?.level ?? 1);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected setLevel(raw: string): void {
    const level = Math.round(Number(raw));
    this.level.set(Number.isFinite(level) ? Math.min(100, Math.max(1, level)) : 1);
  }

  protected async train(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.pvp.training({ classId: this.cls(), level: this.level() });
      await this.router.navigate(['/replay', result.fightId], { state: { result } });
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(false);
    }
  }
}
