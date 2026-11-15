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
  imports: [TranslocoDirective],
  template: `
    <section class="tbca-panel" *transloco="let t" aria-labelledby="attr-title">
      <h2 id="attr-title">{{ t('character.attributes.title') }}</h2>
      <p class="tbca-hint" aria-live="polite">
        {{ t('character.attributes.unspent', { points: unspent() }) }}
      </p>

      <ul class="attrs">
        @for (a of attributes; track a) {
          <li class="attr">
            <span class="attr__name">{{ t('attributes.' + a) }}</span>
            <span class="attr__value">{{ preview().attributes[a] }}</span>
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
        <p class="tbca-error" role="alert">{{ t('errors.' + error()) }}</p>
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
      <p class="tbca-hint">
        {{ t('character.attributes.respecHint', { cost: character().respecCost }) }}
      </p>
    </section>
  `,
  styles: `
    .attrs {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--tbca-space-2);
    }
    .attr {
      display: grid;
      grid-template-columns: 1fr 3rem auto auto;
      align-items: center;
      gap: var(--tbca-space-2);
    }
    .attr__value {
      font: 600 var(--tbca-text-lg) / 1 var(--tbca-font-mono);
      text-align: right;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      gap: var(--tbca-space-2) var(--tbca-space-6);
      margin: 0;
    }
    .stat {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid var(--tbca-line);
      padding-block: var(--tbca-space-1);
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
      color: var(--tbca-neon-cyan);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tbca-space-3);
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
    });
  });

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
