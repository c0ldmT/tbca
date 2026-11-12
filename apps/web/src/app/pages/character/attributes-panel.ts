import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ATTRIBUTES,
  deriveSnapshot,
  type Attribute,
  type Attributes,
  type GameConfig,
} from '@tbca/game-core';
import type { CharacterResponse } from '@tbca/shared';

import { ApiFailure, CharacterService } from '../../core/character.service';
import { Bar } from '../../shared/ui/bar';

const STAT_KEYS = [
  'maxHp',
  'armor',
  'firewall',
  'initiative',
  'accuracy',
  'evasion',
  'critChance',
  'energyRegen',
] as const;

/**
 * Freie Punkte verteilen mit Vorschau der Kampfwerte. Die Vorschau rechnet game-core im
 * Browser; gespeichert und geprüft wird auf dem Server.
 */
@Component({
  selector: 'tbca-attributes-panel',
  imports: [TranslocoDirective, Bar],
  template: `
    <section
      class="tbca-panel tbca-panel--flush tbca-gl tbca-gl--b"
      *transloco="let t"
      aria-labelledby="attr-title"
    >
      <i class="tbca-gx" aria-hidden="true"></i>
      <div class="tbca-ph">
        <div class="tbca-ph__t">
          <h2 id="attr-title">{{ t('character.attributes.title') }}</h2>
          <span class="tbca-idx" aria-live="polite">
            {{ t('character.attributes.unspent', { points: unspent() }) }}
          </span>
        </div>
        <span class="tbca-idx legend">
          <span class="dot dot--base"></span> {{ t('character.attributes.base') }}
          <span class="dot dot--items"></span> {{ t('character.attributes.items') }}
        </span>
      </div>

      <ul class="attrs">
        @for (a of attributes; track a) {
          <li class="attr">
            <span class="attr__n">
              {{ t('attributes.' + a) }}<small>{{ a.toUpperCase() }}</small>
            </span>
            <tbca-bar
              [seg]="true"
              [height]="10"
              [slant]="6"
              [max]="scale()"
              [value]="own().attributes[a]"
              [extra]="preview().attributes[a]"
            />
            <span class="attr__v">{{ preview().attributes[a] }}</span>
            <span class="pm">
              <button
                type="button"
                class="tbca-icon-button"
                [attr.aria-label]="t('character.attributes.remove', { attr: t('attributes.' + a) })"
                [disabled]="pending()[a] <= character().allocated[a]"
                (click)="change(a, -1)"
              >
                −
              </button>
              <button
                type="button"
                class="tbca-icon-button"
                [attr.aria-label]="t('character.attributes.add', { attr: t('attributes.' + a) })"
                [disabled]="unspent() === 0"
                (click)="change(a, 1)"
              >
                +
              </button>
            </span>
          </li>
        }
      </ul>

      <dl class="stats">
        @for (key of statKeys; track key) {
          <div class="stat" [class.stat--changed]="preview().stats[key] !== character().stats[key]">
            <dt>{{ t('stats.' + key) }}</dt>
            <dd>{{ preview().stats[key] }}</dd>
          </div>
        }
      </dl>

      @if (error()) {
        <p class="tbca-error pad" role="alert">{{ t('errors.' + error()) }}</p>
      }
      <div class="actions">
        <button class="tbca-button" type="button" [disabled]="!dirty() || busy()" (click)="save()">
          {{ t('character.attributes.save') }}
        </button>
        <button
          class="tbca-button tbca-button--ghost"
          type="button"
          [disabled]="busy() || spent() === 0 || character().credits < character().respecCost"
          (click)="respec()"
        >
          {{ t('character.attributes.respec') }}
        </button>
      </div>
      <p class="tbca-hint pad">
        {{ t('character.attributes.respecHint', { cost: character().respecCost }) }}
        {{ t('character.attributes.triangle') }}
      </p>
    </section>
  `,
  styles: `
    .legend {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      transform: rotate(45deg);
    }
    .dot--base {
      background: var(--tbca-neon-cyan);
    }
    .dot--items {
      background: var(--tbca-tier-4);
      margin-left: 8px;
    }
    .attrs {
      list-style: none;
      margin: 0;
      padding: 18px 22px 8px;
      display: grid;
      gap: 12px;
    }
    .attr {
      display: grid;
      grid-template-columns: 150px minmax(0, 1fr) 56px auto;
      align-items: center;
      gap: 12px;
    }
    .attr__n {
      font: 600 0.875rem / 1 var(--tbca-font-display);
      letter-spacing: 0.06em;
    }
    .attr__n small {
      display: block;
      margin-top: 4px;
      font: 500 0.625rem / 1 var(--tbca-font-mono);
      color: var(--tbca-text-muted);
      letter-spacing: 0.14em;
    }
    .attr__v {
      font: 500 1.125rem / 1 var(--tbca-font-mono);
      text-align: right;
    }
    .pm {
      display: flex;
      gap: 6px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      gap: 1px;
      margin: 10px 22px;
      background: rgb(0 240 255 / 0.1);
      border: 1px solid rgb(0 240 255 / 0.1);
    }
    .stat {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      background: rgb(7 8 13 / 0.72);
      font-size: var(--tbca-text-sm);
    }
    .stat dt {
      color: var(--tbca-text-muted);
    }
    .stat dd {
      margin: 0;
      font-family: var(--tbca-font-mono);
    }
    .stat--changed dd {
      color: var(--tbca-success);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tbca-space-3);
      padding: 8px 22px;
    }
    .pad {
      padding: 0 22px 18px;
    }
    @media (max-width: 760px) {
      .attr {
        grid-template-columns: 96px minmax(0, 1fr) 40px;
      }
      .pm {
        grid-column: 1 / -1;
      }
    }
  `,
})
export class AttributesPanel {
  private readonly characters = inject(CharacterService);

  readonly character = input.required<CharacterResponse>();
  readonly config = input.required<GameConfig>();

  protected readonly attributes = ATTRIBUTES;
  protected readonly statKeys = STAT_KEYS;
  protected readonly pending = signal<Attributes>({ str: 0, dex: 0, int: 0, con: 0 });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // Gespeicherten Stand übernehmen, sobald der Server antwortet.
    effect(() => this.pending.set({ ...this.character().allocated }));
  }

  protected readonly spent = computed(() => sum(this.character().allocated));
  protected readonly unspent = computed(
    () => this.character().unspentPoints - (sum(this.pending()) - this.spent()),
  );
  protected readonly dirty = computed(() =>
    ATTRIBUTES.some((a) => this.pending()[a] !== this.character().allocated[a]),
  );

  protected readonly preview = computed(() => {
    const c = this.character();
    return deriveSnapshot(this.config(), {
      id: c.id,
      name: c.name,
      level: c.level,
      classId: c.classId,
      allocated: this.pending(),
      loadout: { abilities: [], tactics: [] },
      equipment: c.gear,
    });
  });

  /** Eigene Attribute ohne Items, für den Basisanteil im Balken. */
  protected readonly own = computed(() => {
    const c = this.character();
    return deriveSnapshot(this.config(), {
      id: c.id,
      name: c.name,
      level: c.level,
      classId: c.classId,
      allocated: this.pending(),
      loadout: { abilities: [], tactics: [] },
    });
  });

  protected readonly scale = computed(() =>
    Math.max(40, ...ATTRIBUTES.map((a) => Math.ceil(this.preview().attributes[a] * 1.15))),
  );

  protected change(attribute: Attribute, delta: number): void {
    this.pending.update((p) => ({ ...p, [attribute]: p[attribute] + delta }));
  }

  protected save(): Promise<void> {
    return this.run(() => this.characters.setAttributes(this.pending()));
  }

  protected respec(): Promise<void> {
    return this.run(() => this.characters.respec());
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(false);
    }
  }
}

function sum(a: Attributes): number {
  return a.str + a.dex + a.int + a.con;
}
