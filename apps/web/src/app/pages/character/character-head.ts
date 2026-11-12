import { Component, computed, inject, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { silhouetteFor } from '@tbca/assets';
import type { Equipment, GameConfig } from '@tbca/game-core';
import type { CharacterResponse } from '@tbca/shared';

import { LanguageService } from '../../core/language.service';
import { Bar } from '../../shared/ui/bar';
import { HEAD_STATS, formatHeadStat, headStats } from './derive';

/** Klassen-Embleme: Linienzeichen im Sechseck. */
const EMBLEMS: Record<string, string> = {
  bruiser: 'M22 24 h20 v8 h-20 z M26 32 v10 M38 32 v10 M22 42 h20',
  gunner: 'M20 40 L44 22 M38 20 h8 v8 M24 30 l6 6',
  netrunner: 'M22 26 h8 v6 h-4 v6 h12 M34 26 h8 M38 26 v12',
  medtech: 'M32 20 v24 M20 32 h24 M24 24 l16 16',
};

/**
 * Kopf des Charakter-Hubs: Emblem, Name, Klasse, Level, XP und acht Kampfwerte. Liegt eine
 * gedachte Ausrüstung vor (Ziehen, Auswählen), zeigt jeder Wert sein Delta.
 */
@Component({
  selector: 'tbca-character-head',
  imports: [TranslocoDirective, Bar],
  template: `
    <section
      class="tbca-panel head tbca-hub-head tbca-gl tbca-gl--b"
      *transloco="let t"
      [attr.aria-label]="t('character.title')"
    >
      <i class="tbca-gx" aria-hidden="true"></i>
      <div class="emblem" aria-hidden="true">
        <svg
          viewBox="0 0 64 64"
          width="64"
          height="64"
          fill="none"
          stroke="#00F0FF"
          stroke-width="1.6"
        >
          <path d="M32 3 L57 17 V47 L32 61 L7 47 V17 Z" />
          <path d="M32 12 L49 22 V42 L32 52 L15 42 V22 Z" stroke="rgba(0,240,255,.4)" />
          <path [attr.d]="emblem()" [attr.stroke]="accent()" />
        </svg>
      </div>
      <div class="who">
        <span class="tbca-kicker" [style.color]="accent()">
          {{ t('classes.' + character().classId) }} ·
          {{ t('classRole.' + config().classes[character().classId].role) }}
        </span>
        <h1 class="tbca-gl tbca-gl--e">
          {{ character().name }}<span class="lvl">LV {{ character().level }}</span>
        </h1>
        <div class="xp">
          <tbca-bar class="xp__bar" variant="xp" [seg]="true" [value]="xpPercent()" />
          <small>
            @if (character().xpToNext !== null) {
              XP {{ character().xpIntoLevel.toLocaleString(locale()) }} /
              {{ character().xpToNext!.toLocaleString(locale()) }}
            } @else {
              {{ t('character.maxLevel') }}
            }
          </small>
        </div>
      </div>
      <dl class="stats" [attr.aria-label]="t('character.stats')">
        @for (s of stats(); track s.key) {
          <div class="stat">
            <dt>{{ t('character.head.' + s.key) }}</dt>
            <dd>
              {{ s.value }}
              @if (s.delta !== 0) {
                <span
                  class="tbca-delta"
                  [class]="
                    s.delta > 0 ? 'tbca-delta tbca-delta--up' : 'tbca-delta tbca-delta--down'
                  "
                >
                  {{ s.deltaText }}
                </span>
              }
            </dd>
          </div>
        }
      </dl>
    </section>
  `,
  styles: `
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 20px 28px;
      padding: 20px 24px;
    }
    .emblem {
      width: 76px;
      height: 76px;
      flex: none;
      display: grid;
      place-items: center;
      background: radial-gradient(circle, rgb(0 240 255 / 0.25), transparent 70%);
      filter: drop-shadow(0 0 10px rgb(0 240 255 / 0.6));
    }
    .who {
      display: flex;
      flex-direction: column;
      gap: 7px;
      min-width: 260px;
    }
    h1 {
      font: 700 2.25rem / 1 var(--tbca-font-display);
      letter-spacing: 0.04em;
    }
    .lvl {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      height: 26px;
      margin-left: 10px;
      padding: 0 8px;
      vertical-align: middle;
      font: 700 0.8125rem / 1 var(--tbca-font-mono);
      color: var(--tbca-bg-void);
      background: var(--tbca-neon-yellow);
      clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
    }
    .xp {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .xp__bar {
      width: 260px;
    }
    .xp small {
      font: 500 0.6875rem / 1 var(--tbca-font-mono);
      color: var(--tbca-text-muted);
    }
    .stats {
      flex: 1 1 560px;
      display: grid;
      grid-template-columns: repeat(8, minmax(0, 1fr));
      gap: 1px;
      margin: 0;
      background: rgb(0 240 255 / 0.1);
      border: 1px solid rgb(0 240 255 / 0.1);
    }
    .stat {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px 12px;
      background: rgb(7 8 13 / 0.72);
      min-width: 0;
    }
    dt {
      font: 500 0.625rem / 1 var(--tbca-font-mono);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--tbca-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    dd {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin: 0;
      font: 500 1.25rem / 1 var(--tbca-font-mono);
    }
    @media (max-width: 760px) {
      .stats {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .xp__bar {
        width: 160px;
      }
      .who {
        min-width: 0;
      }
    }
  `,
})
export class CharacterHead {
  private readonly language = inject(LanguageService);

  readonly character = input.required<CharacterResponse>();
  readonly config = input.required<GameConfig>();
  /** Gedachte Ausrüstung; null = keine Vorschau. */
  readonly preview = input<Equipment | null>(null);

  protected readonly locale = this.language.current;
  protected readonly accent = computed(() => silhouetteFor(this.character().classId).accent);
  protected readonly emblem = computed(
    () => EMBLEMS[this.character().classId] ?? EMBLEMS['netrunner']!,
  );
  protected readonly xpPercent = computed(() => {
    const c = this.character();
    return c.xpToNext ? Math.min(100, (c.xpIntoLevel / c.xpToNext) * 100) : 100;
  });

  protected readonly stats = computed(() => {
    const c = this.character();
    const config = this.config();
    const locale = this.locale();
    const now = headStats(config, c);
    const preview = this.preview();
    let next = now;
    if (preview) {
      try {
        next = headStats(config, c, preview);
      } catch {
        next = now; // ungültige Kombination: keine Vorschau
      }
    }
    return HEAD_STATS.map((key) => {
      const delta = next[key] - now[key];
      const shown = formatHeadStat(key, Math.abs(delta), locale);
      return {
        key,
        value: formatHeadStat(key, now[key], locale),
        delta,
        deltaText: (delta > 0 ? '+' : '−') + shown,
      };
    });
  });
}
