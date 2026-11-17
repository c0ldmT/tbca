import { Component, computed, inject, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { effectiveItem, rarityTier, type ItemData, type ItemStat } from '@tbca/game-core';

import { GameConfigService } from '../../core/game-config.service';

/** Item mit Sternen in Tierfarbe (9 Silhouetten, darüber Overflow), Basiswerten und Affixen. */
@Component({
  selector: 'tbca-item-card',
  imports: [TranslocoDirective],
  template: `
    <div class="item" *transloco="let t" [attr.data-tier]="tier()">
      <div class="item__head">
        <span class="item__name">
          {{ t('items.' + item().templateId) }}
          @if (item().upgrade) {
            <span class="item__upgrade">+{{ item().upgrade }}</span>
          }
        </span>
        <span class="item__level">{{ t('inventory.itemLevel', { level: item().itemLevel }) }}</span>
      </div>
      <span class="stars" [attr.aria-label]="t('inventory.rarity', { rarity: item().rarity })">
        @for (filled of stars(); track $index) {
          <span class="star" [class.star--on]="filled" aria-hidden="true">★</span>
        }
        @if (overflow() > 0) {
          <span class="stars__overflow" aria-hidden="true">+{{ overflow() }}</span>
        }
      </span>
      <ul class="item__stats">
        @for (s of baseStats(); track s.stat) {
          <li>{{ statLabel(s.stat, t) }} {{ format(s.stat, s.value) }}</li>
        }
        @for (a of shown().affixes; track a.stat) {
          <li class="item__affix">{{ statLabel(a.stat, t) }} +{{ format(a.stat, a.value) }}</li>
        }
      </ul>
    </div>
  `,
  styles: `
    .item {
      --tier: var(--tbca-tier-1);
      display: grid;
      gap: var(--tbca-space-1);
      padding: var(--tbca-space-3);
      border: 1px solid var(--tbca-line);
      border-left: 3px solid var(--tier);
      background: var(--tbca-surface-2);
    }
    .item[data-tier='2'] {
      --tier: var(--tbca-tier-2);
      box-shadow: 0 0 8px rgb(0 240 255 / 0.15);
    }
    .item[data-tier='3'] {
      --tier: var(--tbca-tier-3);
      box-shadow: 0 0 10px rgb(255 176 0 / 0.2);
    }
    .item[data-tier='4'] {
      --tier: var(--tbca-tier-4);
      box-shadow: 0 0 12px rgb(180 76 255 / 0.3);
    }
    .item[data-tier='5'] {
      --tier: var(--tbca-tier-5);
      box-shadow: 0 0 14px rgb(255 59 59 / 0.35);
    }
    .item[data-tier='6'] {
      --tier: var(--tbca-tier-6);
      border-image: var(--tbca-tier-6-holo) 1;
    }
    .item__head {
      display: flex;
      justify-content: space-between;
      gap: var(--tbca-space-2);
    }
    .item__name {
      font: 700 var(--tbca-text-base) / 1.2 var(--tbca-font-display);
      color: var(--tier);
    }
    .item__level {
      font: var(--tbca-text-sm) var(--tbca-font-mono);
      color: var(--tbca-text-muted);
    }
    .stars {
      display: flex;
      align-items: center;
      gap: 1px;
      font-size: 0.8rem;
    }
    .star {
      color: var(--tbca-line);
    }
    .star--on {
      color: var(--tier);
    }
    .stars__overflow {
      margin-left: var(--tbca-space-1);
      font: 700 0.75rem var(--tbca-font-mono);
      color: var(--tier);
    }
    .item__stats {
      margin: 0;
      padding: 0;
      list-style: none;
      font: var(--tbca-text-sm) / 1.5 var(--tbca-font-mono);
    }
    .item__upgrade {
      font-family: var(--tbca-font-mono);
      color: var(--tbca-neon-yellow);
    }
    .item__affix {
      color: var(--tbca-neon-cyan);
    }
  `,
})
export class ItemCard {
  private readonly gameConfig = inject(GameConfigService);

  readonly item = input.required<ItemData>();

  /** Werte inklusive Aufwertung (+3 % je Stufe). */
  protected readonly shown = computed(() => {
    const config = this.gameConfig.current()?.game;
    return config ? effectiveItem(config, this.item()) : this.item();
  });

  protected readonly tier = computed(() => Math.min(6, rarityTier(this.item().rarity)));
  protected readonly stars = computed(() =>
    Array.from({ length: 9 }, (_, i) => i < Math.min(9, this.item().rarity)),
  );
  protected readonly overflow = computed(() => Math.max(0, this.item().rarity - 9));
  protected readonly baseStats = computed(() =>
    Object.entries(this.shown().base).map(([stat, value]) => ({ stat, value: value ?? 0 })),
  );

  protected statLabel(stat: string, t: (key: string) => string): string {
    return t(
      ['str', 'dex', 'int', 'con'].includes(stat) ? `attributes.${stat}` : `itemStats.${stat}`,
    );
  }

  protected format(stat: string, value: number): string {
    if ((stat as ItemStat) === 'damageDealt') return `${(value / 10).toLocaleString()} %`;
    if ((stat as ItemStat) === 'critChance') return `${value} ‰`;
    return String(value);
  }
}
