import { Injectable, computed, inject, signal } from '@angular/core';
import { slotsFor, type EquipSlot, type Equipment, type ItemData } from '@tbca/game-core';
import type { InventoryView, ItemView } from '@tbca/shared';

import { ApiFailure } from '../../../core/api-failure';
import { CharacterService } from '../../../core/character.service';

/**
 * Inventar und Ausrüstung des Charakter-Hubs, geteilt zwischen Ausrüstung, Werkstatt und dem
 * Charakterkopf. `preview` ist eine gedachte Ausrüstung (beim Ziehen oder Auswählen), deren
 * Werte der Kopf als Delta zeigt.
 */
@Injectable()
export class GearState {
  private readonly characters = inject(CharacterService);

  readonly inventory = signal<InventoryView | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly preview = signal<Equipment | null>(null);

  readonly byId = computed(() => new Map(this.inventory()?.items.map((i) => [i.id, i]) ?? []));
  readonly items = computed(() => this.inventory()?.items ?? []);
  readonly stacks = computed(() => this.inventory()?.stacks ?? {});

  /** Aktuelle Ausrüstung als Items je Platz. */
  readonly equipment = computed<Equipment>(() => {
    const inv = this.inventory();
    const byId = this.byId();
    const out: Equipment = {};
    if (!inv) return out;
    for (const [slot, id] of Object.entries(inv.equipment) as [EquipSlot, string][]) {
      const item = byId.get(id);
      if (item) out[slot] = item;
    }
    return out;
  });

  equipped(slot: EquipSlot): ItemView | null {
    const id = this.inventory()?.equipment[slot];
    return id ? (this.byId().get(id) ?? null) : null;
  }

  targets(item: ItemData): readonly EquipSlot[] {
    return this.inventory()?.slotsByCategory[item.category] ?? slotsFor(item.category);
  }

  /** Ob ein Item in einen Platz darf; die Nebenhand ist hinter einem Zweihänder gesperrt. */
  fits(item: ItemData, slot: EquipSlot): boolean {
    if (!this.targets(item).includes(slot)) return false;
    if (slot === 'off_hand' && item.category !== 'weapon_2h') {
      const main = this.equipped('main_hand');
      if (main?.category === 'weapon_2h') return false;
    }
    return true;
  }

  /** Gedachte Ausrüstung, wenn `item` in `slot` käme (wie der Server es umsetzt). */
  equipmentWith(item: ItemView, slot: EquipSlot): Equipment {
    const next: Equipment = { ...this.equipment() };
    for (const [s, it] of Object.entries(next) as [EquipSlot, ItemView][]) {
      if (it.id === item.id) delete next[s];
    }
    next[slot] = item;
    if (slot === 'main_hand' && item.category === 'weapon_2h') delete next.off_hand;
    return next;
  }

  /** Bevorzugter Platz: ein freier passender, sonst der erste passende. */
  preferredSlot(item: ItemData): EquipSlot | null {
    const options = this.targets(item).filter((s) => this.fits(item, s));
    return options.find((s) => !this.equipped(s)) ?? options[0] ?? null;
  }

  async load(): Promise<void> {
    await this.run(() => this.characters.inventory());
  }

  async equip(
    slot: EquipSlot,
    item: ItemView,
    swapBackTo: EquipSlot | null = null,
  ): Promise<boolean> {
    const previous = this.equipped(slot);
    const ok = await this.run(() => this.characters.equip(slot, item.id));
    // Platz-zu-Platz: das verdrängte Item wandert an den alten Platz, wenn es dort passt.
    if (
      ok &&
      swapBackTo &&
      previous &&
      previous.id !== item.id &&
      this.fits(previous, swapBackTo)
    ) {
      await this.run(() => this.characters.equip(swapBackTo, previous.id));
    }
    return ok;
  }

  unequip(slot: EquipSlot): Promise<boolean> {
    return this.run(() => this.characters.unequip(slot));
  }

  async testLoot(): Promise<boolean> {
    return this.run(async () => {
      await this.characters.testLoot();
      return this.characters.inventory();
    });
  }

  /** Nach Werkstatt-Aktionen: Inventar und Charakterwerte neu laden. */
  async reload(): Promise<void> {
    await this.load();
    void this.characters.refresh().catch(() => undefined);
  }

  private async run(action: () => Promise<InventoryView>): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.inventory.set(await action());
      return true;
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
