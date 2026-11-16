import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { EQUIP_SLOTS, type EquipSlot } from '@tbca/game-core';
import type { CharacterResponse, InventoryView, ItemView } from '@tbca/shared';

import { ApiFailure } from '../../core/api-failure';
import { CharacterService } from '../../core/character.service';
import { ItemCard } from './item-card';

/** Ausrüstung und Inventar: Plätze belegen, ablegen, in Test-Seasons Beute würfeln. */
@Component({
  selector: 'tbca-equipment-panel',
  imports: [TranslocoDirective, ItemCard],
  templateUrl: './equipment-panel.html',
  styleUrl: './equipment-panel.css',
})
export class EquipmentPanel {
  private readonly characters = inject(CharacterService);

  readonly character = input.required<CharacterResponse>();
  /** Test-Seasons erlauben zufällige Test-Beute. */
  readonly testSeason = input(false);

  protected readonly slots = EQUIP_SLOTS;
  protected readonly inventory = signal<InventoryView | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly byId = computed(
    () => new Map(this.inventory()?.items.map((i) => [i.id, i]) ?? []),
  );
  protected readonly backpack = computed(() =>
    (this.inventory()?.items ?? []).filter((i) => i.equippedIn === null).reverse(),
  );

  constructor() {
    // Charakter gewechselt (z. B. Klasse) oder neu angelegt: Inventar neu laden.
    effect(() => {
      if (this.character().id) void this.run(() => this.characters.inventory());
    });
  }

  protected equipped(slot: EquipSlot): ItemView | null {
    const id = this.inventory()?.equipment[slot];
    return id ? (this.byId().get(id) ?? null) : null;
  }

  protected targets(item: ItemView): EquipSlot[] {
    return this.inventory()?.slotsByCategory[item.category] ?? [];
  }

  protected equip(slot: EquipSlot, item: ItemView): Promise<void> {
    return this.run(() => this.characters.equip(slot, item.id));
  }

  protected unequip(slot: EquipSlot): Promise<void> {
    return this.run(() => this.characters.unequip(slot));
  }

  protected async testLoot(): Promise<void> {
    await this.run(async () => {
      await this.characters.testLoot();
      return this.characters.inventory();
    });
  }

  private async run(action: () => Promise<InventoryView>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.inventory.set(await action());
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(false);
    }
  }
}
