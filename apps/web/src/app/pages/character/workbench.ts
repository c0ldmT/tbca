import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  itemValue,
  rerollCost,
  salvageYield,
  transferCost,
  upgradeCost,
  type GameConfig,
  type ItemStat,
} from '@tbca/game-core';
import type { ItemView } from '@tbca/shared';

import { ApiFailure } from '../../core/api-failure';
import { EconomyService } from '../../core/economy.service';
import { ItemCard } from './item-card';

/** Werkbank für ein ausgewähltes Item: Aufwerten, Neu würfeln, Affix übertragen, Zerlegen, Verkaufen. */
@Component({
  selector: 'tbca-workbench',
  imports: [TranslocoDirective, ItemCard],
  templateUrl: './workbench.html',
  styleUrl: './workbench.css',
})
export class Workbench {
  private readonly economy = inject(EconomyService);

  readonly item = input.required<ItemView>();
  readonly items = input.required<ItemView[]>();
  readonly config = input.required<GameConfig>();
  readonly stacks = input.required<Record<string, number>>();
  readonly credits = input.required<number>();
  /** Nach jeder Aktion: Inventar und Charakter neu laden. */
  readonly changed = output<{ message: string; params: Record<string, unknown> }>();
  readonly closed = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly equipped = computed(() => this.item().equippedIn !== null);
  protected readonly upgrade = computed(() => {
    try {
      return upgradeCost(this.config(), this.item());
    } catch {
      return null; // höchste Stufe
    }
  });
  protected readonly salvage = computed(() => salvageYield(this.config(), this.item()));
  protected readonly sellPrice = computed(() =>
    Math.floor((itemValue(this.config(), this.item()) * this.config().shop.sellPermille) / 1000),
  );
  protected readonly reroll = computed(() => rerollCost(this.config(), this.item()));
  protected readonly transfer = computed(() => transferCost(this.config(), this.item()));
  /** Affixe anderer, nicht ausgerüsteter Items, die zum Ziel passen. */
  protected readonly donors = computed(() => {
    const target = this.item();
    const pool = new Set(
      this.config().items.templates.find((t) => t.id === target.templateId)?.affixPool ?? [],
    );
    const present = new Set(target.affixes.map((a) => a.stat));
    return this.items()
      .filter((i) => i.id !== target.id && i.equippedIn === null)
      .flatMap((donor) =>
        donor.affixes
          .filter((a) => pool.has(a.stat) && !present.has(a.stat))
          .map((a) => ({ donor, stat: a.stat, value: a.value })),
      );
  });

  protected materialsText(
    cost: Partial<Record<string, number>>,
    t: (k: string, p?: object) => string,
  ): string {
    return Object.entries(cost)
      .map(([id, n]) => t('inventory.materialAmount', { amount: n, name: t('materials.' + id) }))
      .join(', ');
  }

  protected doUpgrade() {
    return this.run(
      () => this.economy.upgrade(this.item().id),
      (r) => (r.success ? 'workbench.upgraded' : 'workbench.upgradeFailed'),
      (r) => ({ level: r.item?.upgrade ?? 0 }),
    );
  }

  protected doReroll(stat: ItemStat) {
    return this.run(
      () => this.economy.reroll(this.item().id, stat),
      () => 'workbench.rerolled',
      () => ({}),
    );
  }

  protected doTransfer(donorId: string, stat: ItemStat) {
    return this.run(
      () => this.economy.transfer(this.item().id, donorId, stat),
      (r) => (r.success ? 'workbench.transferred' : 'workbench.transferFailed'),
      () => ({}),
    );
  }

  protected doSalvage() {
    return this.run(
      () => this.economy.salvage(this.item().id),
      () => 'workbench.salvaged',
      () => ({}),
      true,
    );
  }

  protected doSell() {
    return this.run(
      () => this.economy.sell(this.item().id),
      () => 'workbench.sold',
      () => ({ credits: this.sellPrice() }),
      true,
    );
  }

  private async run<T>(
    action: () => Promise<T>,
    message: (r: T) => string,
    params: (r: T) => Record<string, unknown>,
    close = false,
  ): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await action();
      this.changed.emit({ message: message(result), params: params(result) });
      if (close) this.closed.emit();
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(false);
    }
  }
}
