import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { CLASS_IDS, type ClassId } from '@tbca/game-core';

import { ApiFailure, CharacterService } from '../../core/character.service';
import { GameConfigService } from '../../core/game-config.service';
import { SoundService } from '../../core/sound.service';
import { SilhouetteFigure } from '../../shared/ui/silhouette';
import { AttributesPanel } from './attributes-panel';

/** Tab „Attribute & Klasse“: Punkte verteilen und Klasse wechseln. */
@Component({
  selector: 'tbca-build-page',
  imports: [TranslocoDirective, AttributesPanel, SilhouetteFigure],
  template: `
    <div class="two" *transloco="let t">
      @if (character(); as c) {
        @if (config(); as game) {
          <tbca-attributes-panel [character]="c" [config]="game" />
          <section class="tbca-panel tbca-panel--flush tbca-gl tbca-gl--d" aria-labelledby="cl-t">
            <i class="tbca-gx" aria-hidden="true"></i>
            <div class="tbca-ph">
              <div class="tbca-ph__t">
                <h2 id="cl-t">{{ t('character.class.title') }}</h2>
                <span class="tbca-idx">{{ t('character.class.keeps') }}</span>
              </div>
            </div>
            <div class="cls" role="radiogroup" [attr.aria-label]="t('character.class.title')">
              @for (id of classIds; track id) {
                <button
                  type="button"
                  role="radio"
                  class="clsb"
                  [attr.aria-checked]="c.classId === id"
                  [disabled]="switching()"
                  (click)="switchClass(id, c.classId)"
                >
                  <tbca-silhouette class="clsb__fig" [classId]="id" [wire]="false" />
                  <strong>{{ t('classes.' + id) }}</strong>
                  <span
                    >{{ t('classRole.' + game.classes[id].role) }} ·
                    {{ game.classes[id].primary.toUpperCase() }}</span
                  >
                </button>
              }
            </div>
            <p class="hint">{{ t('character.class.hint') }}</p>
            @if (error()) {
              <p class="tbca-error hint" role="alert">{{ t('errors.' + error()) }}</p>
            }
          </section>
        }
      }
    </div>
  `,
  styles: `
    .two {
      display: flex;
      flex-wrap: wrap;
      gap: 18px;
      align-items: flex-start;
    }
    .two > * {
      flex: 1 1 480px;
      min-width: 0;
    }
    .cls {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      padding: 18px 22px 12px;
    }
    .clsb {
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr);
      align-items: center;
      gap: 4px 14px;
      padding: 12px 16px 12px 10px;
      text-align: left;
      background: rgb(7 8 13 / 0.5);
      border: 1px solid rgb(255 255 255 / 0.1);
      cursor: pointer;
    }
    .clsb:hover {
      border-color: rgb(0 240 255 / 0.4);
    }
    .clsb[aria-checked='true'] {
      border-color: var(--tbca-neon-cyan);
      box-shadow:
        0 0 0 1px var(--tbca-neon-cyan),
        0 0 22px rgb(0 240 255 / 0.3);
      background: rgb(0 240 255 / 0.06);
    }
    .clsb__fig {
      grid-row: 1 / 3;
      width: 56px;
      height: 96px;
    }
    strong {
      align-self: end;
      font: 700 1.125rem / 1 var(--tbca-font-display);
    }
    span {
      align-self: start;
      font-size: 0.75rem;
      color: var(--tbca-text-muted);
    }
    .hint {
      padding: 0 22px 20px;
      font-size: 0.75rem;
      line-height: 1.5;
      color: var(--tbca-text-muted);
    }
    @media (max-width: 760px) {
      .cls {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class BuildPage {
  private readonly characters = inject(CharacterService);
  private readonly gameConfig = inject(GameConfigService);
  private readonly sound = inject(SoundService);

  protected readonly character = this.characters.state;
  protected readonly config = computed(() => this.gameConfig.current()?.game ?? null);
  protected readonly classIds = CLASS_IDS;
  protected readonly switching = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async switchClass(classId: ClassId, current: ClassId): Promise<void> {
    if (classId === current) return;
    this.switching.set(true);
    this.error.set(null);
    try {
      await this.characters.switchClass(classId);
      this.sound.play('equip');
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.switching.set(false);
    }
  }
}
