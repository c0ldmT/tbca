import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject, signal, type OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { SILHOUETTE_VIEWBOX, silhouetteFor } from '@tbca/assets';
import {
  CONSUMABLES,
  MATERIALS,
  effectiveItem,
  itemValue,
  type EquipSlot,
  type ItemCategory,
  type ItemStat,
} from '@tbca/game-core';
import type { ItemView } from '@tbca/shared';

import { ApiFailure } from '../../../core/api-failure';
import { CharacterService } from '../../../core/character.service';
import { EconomyService } from '../../../core/economy.service';
import { GameConfigService } from '../../../core/game-config.service';
import { LanguageService } from '../../../core/language.service';
import { SoundService } from '../../../core/sound.service';
import {
  affixQuality,
  qualityPercent,
  statLabel,
  statValue,
  tier,
} from '../../../shared/item-format';
import { ItemIcon } from '../../../shared/ui/item-icon';
import { Segments } from '../../../shared/ui/segments';
import { SilhouetteFigure } from '../../../shared/ui/silhouette';
import { Stars } from '../../../shared/ui/stars';
import { Bar } from '../../../shared/ui/bar';
import { WRENCH_ICON } from '../character.page';
import { HEAD_STATS, formatHeadStat, headStats } from '../derive';
import { GearState } from './gear-state';
import { ItemNamePipe } from '../../../shared/item-name';

const LEFT: EquipSlot[] = ['head', 'torso', 'hands', 'legs', 'feet'];
const RIGHT: EquipSlot[] = ['implant_1', 'core_implant', 'implant_2', 'main_hand', 'off_hand'];

type Filter = 'all' | 'weapon' | 'armor' | 'cyber';
type Sort = 'rarity' | 'level' | 'new';

const GROUP: Record<ItemCategory, Exclude<Filter, 'all'>> = {
  weapon_1h: 'weapon',
  weapon_2h: 'weapon',
  shield: 'weapon',
  head: 'armor',
  torso: 'armor',
  legs: 'armor',
  feet: 'armor',
  hands: 'armor',
  implant: 'cyber',
  core_implant: 'cyber',
};

/** Auswahl: ein Platz (auch leer) oder ein Item im Inventar. */
type Selection = { kind: 'slot'; slot: EquipSlot } | { kind: 'item'; id: string };

interface Drag {
  item: ItemView;
  from: EquipSlot | null;
  x: number;
  y: number;
  /** Erst nach ein paar Pixeln Bewegung wird aus einem Klick ein Ziehen. */
  active: boolean;
  startX: number;
  startY: number;
  pointerId: number;
}

/**
 * Ausrüstung: Paper-Doll mit Klassen-Silhouette (links/rechts je fünf Plätze), Details des
 * gewählten Items und Inventar darunter. Items lassen sich mit Maus oder Stift auf Plätze
 * ziehen; auf Touch und per Tastatur wählt man ein Item und tippt dann einen markierten Platz.
 */
@Component({
  selector: 'tbca-gear-page',
  imports: [
    TranslocoDirective,
    RouterLink,
    ItemIcon,
    Stars,
    Segments,
    SilhouetteFigure,
    Bar,
    ItemNamePipe,
  ],
  templateUrl: './gear.page.html',
  styleUrl: './gear.page.css',
  host: {
    '(document:pointermove)': 'onPointerMove($event)',
    '(document:pointerup)': 'onPointerUp($event)',
    '(document:pointercancel)': 'cancelDrag()',
  },
})
export class GearPage implements OnDestroy {
  protected readonly gear = inject(GearState);
  protected readonly characters = inject(CharacterService);
  private readonly economy = inject(EconomyService);
  private readonly gameConfig = inject(GameConfigService);
  private readonly sound = inject(SoundService);
  private readonly language = inject(LanguageService);
  private readonly document = inject(DOCUMENT);

  protected readonly left = LEFT;
  protected readonly right = RIGHT;
  protected readonly viewBox = SILHOUETTE_VIEWBOX;
  protected readonly wrench = WRENCH_ICON;
  protected readonly filters: Filter[] = ['all', 'weapon', 'armor', 'cyber'];
  protected readonly materials = [...MATERIALS, ...CONSUMABLES];
  protected readonly statLabel = statLabel;
  protected readonly locale = this.language.current;

  protected readonly selection = signal<Selection>({ kind: 'slot', slot: 'main_hand' });
  protected readonly filter = signal<Filter>('all');
  protected readonly sort = signal<Sort>('rarity');
  protected readonly drag = signal<Drag | null>(null);
  protected readonly over = signal<EquipSlot | 'inventory' | null>(null);
  protected readonly notice = signal<string | null>(null);
  private suppressClick = false;

  protected readonly config = computed(() => this.gameConfig.current()?.game ?? null);
  protected readonly testSeason = computed(() => this.gameConfig.current()?.season.isTest ?? false);
  protected readonly character = this.characters.state;
  protected readonly silhouette = computed(() => silhouetteFor(this.character()?.classId));
  protected readonly twoHanded = computed(
    () => this.gear.equipped('main_hand')?.category === 'weapon_2h',
  );

  /** Item der Auswahl (bei leerem Platz null). */
  protected readonly selectedItem = computed<ItemView | null>(() => {
    const sel = this.selection();
    if (sel.kind === 'slot') return this.gear.equipped(sel.slot);
    return this.gear.byId().get(sel.id) ?? null;
  });
  protected readonly selectedFromInventory = computed(
    () => this.selection().kind === 'item' && this.selectedItem()?.equippedIn === null,
  );
  /** Item, dessen Ziel-Plätze leuchten: gezogenes oder im Inventar gewähltes. */
  protected readonly candidate = computed<ItemView | null>(() => {
    const d = this.drag();
    if (d?.active) return d.item;
    return this.selectedFromInventory() ? this.selectedItem() : null;
  });

  protected readonly backpack = computed(() => {
    const filter = this.filter();
    const sort = this.sort();
    const list = this.gear
      .items()
      .filter((i) => i.equippedIn === null)
      .filter((i) => filter === 'all' || GROUP[i.category] === filter);
    return list.sort((a, b) => {
      if (sort === 'level') return b.itemLevel - a.itemLevel || b.rarity - a.rarity;
      if (sort === 'new') return b.createdAt.localeCompare(a.createdAt);
      return b.rarity - a.rarity || b.itemLevel - a.itemLevel;
    });
  });
  protected readonly backpackCount = computed(
    () => this.gear.items().filter((i) => i.equippedIn === null).length,
  );
  /** Neu = in den letzten 24 Stunden erhalten. */
  private readonly newSince = Date.now() - 24 * 3600_000;

  protected readonly equippedCount = computed(
    () => Object.keys(this.gear.inventory()?.equipment ?? {}).length,
  );
  protected readonly totalPower = computed(() => {
    const config = this.config();
    if (!config) return 0;
    return Object.values(this.gear.equipment()).reduce(
      (sum, item) => sum + effectiveItem(config, item).budget,
      0,
    );
  });

  /** Gedachte Ausrüstung für Vorschau und Vergleich. */
  private readonly previewSlot = computed<EquipSlot | null>(() => {
    const item = this.candidate();
    if (!item) return null;
    const over = this.over();
    if (over && over !== 'inventory' && this.gear.fits(item, over)) return over;
    return this.gear.preferredSlot(item);
  });

  constructor() {
    effect(() => {
      const item = this.candidate();
      const slot = this.previewSlot();
      const d = this.drag();
      if (d?.active && d.from && this.over() === 'inventory') {
        const next = { ...this.gear.equipment() };
        delete next[d.from];
        this.gear.preview.set(next);
      } else {
        this.gear.preview.set(item && slot ? this.gear.equipmentWith(item, slot) : null);
      }
    });
  }

  ngOnDestroy(): void {
    this.gear.preview.set(null);
    this.document.documentElement.classList.remove('tbca-dragging');
  }

  // ----- Darstellung -----

  protected slotView(slot: EquipSlot) {
    const item = this.gear.equipped(slot);
    const candidate = this.candidate();
    const blocked = slot === 'off_hand' && this.twoHanded();
    const sel = this.selection();
    const dragging = !!this.drag()?.active;
    return {
      slot,
      item,
      blocked,
      selected: !dragging && sel.kind === 'slot' && sel.slot === slot,
      valid: !!candidate && this.gear.fits(candidate, slot),
      dim: !!candidate && dragging && !this.gear.fits(candidate, slot),
      over: this.over() === slot,
    };
  }

  protected nodes = computed(() => {
    const shape = this.silhouette();
    const sel = this.selection();
    const candidate = this.candidate();
    const equipment = this.gear.inventory()?.equipment ?? {};
    return (Object.entries(shape.nodes) as [EquipSlot, readonly [number, number]][]).map(
      ([slot, [x, y]]) => {
        const selected = sel.kind === 'slot' && sel.slot === slot;
        const drop = !!candidate && this.gear.fits(candidate, slot);
        return {
          x,
          y,
          r: selected || this.over() === slot ? 5 : equipment[slot] ? 3.2 : 2.4,
          cls: drop ? 'node node--drop' : selected ? 'node node--on' : 'node',
        };
      },
    );
  });

  protected tierOf(rarity: number): number {
    return tier(rarity);
  }

  protected isNew(item: ItemView): boolean {
    return Date.parse(item.createdAt) > this.newSince;
  }

  protected readonly detail = computed(() => {
    const item = this.selectedItem();
    const config = this.config();
    if (!item || !config) return null;
    const shown = effectiveItem(config, item);
    const up = item.upgrade ?? 0;
    const locale = this.locale();
    return {
      item,
      tier: tier(item.rarity),
      up,
      power: shown.budget.toLocaleString(locale),
      base: Object.entries(shown.base).map(([stat, value]) => ({
        stat,
        value: statValue(stat, value ?? 0, locale),
        raw: item.base[stat as ItemStat] ?? 0,
      })),
      affixes: shown.affixes.map((a, i) => {
        const raw = item.affixes[i]!.value;
        return {
          stat: a.stat,
          value: statValue(a.stat, a.value, locale),
          quality: qualityPercent(affixQuality(config, item, a.stat, raw)),
        };
      }),
      sellPrice: Math.floor((itemValue(config, item) * config.shop.sellPermille) / 1000),
      targets: this.gear.targets(item).filter((s) => this.gear.fits(item, s)),
    };
  });

  /** Vergleich mit dem bisher ausgerüsteten Item (nur für Items aus dem Inventar). */
  protected readonly compare = computed(() => {
    const item = this.selectedItem();
    const config = this.config();
    const c = this.character();
    const slot = this.previewSlot();
    if (!item || !config || !c || !slot || !this.selectedFromInventory() || this.drag()?.active) {
      return null;
    }
    const now = headStats(config, c, this.gear.equipment());
    let next = now;
    try {
      next = headStats(config, c, this.gear.equipmentWith(item, slot));
    } catch {
      return null;
    }
    const locale = this.locale();
    const rows = HEAD_STATS.map((key) => ({ key, delta: next[key] - now[key] }))
      .filter((r) => r.delta !== 0)
      .map((r) => ({
        key: r.key,
        delta: r.delta,
        text: (r.delta > 0 ? '+' : '−') + formatHeadStat(r.key, Math.abs(r.delta), locale),
      }));
    return { slot, against: this.gear.equipped(slot), rows };
  });

  /** Passende Items für einen leeren Platz. */
  protected readonly fitting = computed(() => {
    const sel = this.selection();
    if (sel.kind !== 'slot' || this.gear.equipped(sel.slot)) return [];
    return this.gear
      .items()
      .filter((i) => i.equippedIn === null && this.gear.fits(i, sel.slot))
      .sort((a, b) => b.rarity - a.rarity)
      .slice(0, 8);
  });

  protected stat(stat: string, t: (k: string, p?: Record<string, unknown>) => string): string {
    return statLabel(stat, t);
  }

  // ----- Auswahl und Aktionen -----

  protected clickSlot(slot: EquipSlot): void {
    if (this.consumeClick()) return;
    const candidate = this.candidate();
    if (candidate && this.selectedFromInventory() && this.gear.fits(candidate, slot)) {
      void this.equip(candidate, slot);
      return;
    }
    this.sound.play('click');
    this.notice.set(null);
    this.selection.set({ kind: 'slot', slot });
  }

  protected clickItem(item: ItemView): void {
    if (this.consumeClick()) return;
    this.sound.play('click');
    this.notice.set(null);
    const sel = this.selection();
    this.selection.set(
      sel.kind === 'item' && sel.id === item.id
        ? { kind: 'slot', slot: this.gear.preferredSlot(item) ?? 'main_hand' }
        : { kind: 'item', id: item.id },
    );
  }

  protected async equip(item: ItemView, slot: EquipSlot, swapBackTo: EquipSlot | null = null) {
    const ok = await this.gear.equip(slot, item, swapBackTo);
    if (ok) {
      this.sound.play('equip');
      this.selection.set({ kind: 'slot', slot });
    } else {
      this.sound.play('fail');
    }
  }

  protected async unequip(slot: EquipSlot): Promise<void> {
    const item = this.gear.equipped(slot);
    if (await this.gear.unequip(slot)) {
      this.sound.play('unequip');
      if (item) this.selection.set({ kind: 'item', id: item.id });
    }
  }

  protected async sell(item: ItemView, price: number): Promise<void> {
    try {
      await this.economy.sell(item.id);
      this.notice.set(String(price));
      this.sound.play('success');
      this.selection.set({ kind: 'slot', slot: this.gear.preferredSlot(item) ?? 'main_hand' });
      await this.gear.reload();
    } catch (error) {
      this.gear.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    }
  }

  protected testLoot(): Promise<boolean> {
    return this.gear.testLoot();
  }

  // ----- Ziehen mit Maus oder Stift -----

  protected startDrag(event: PointerEvent, item: ItemView | null, from: EquipSlot | null): void {
    if (!item || event.button !== 0 || event.pointerType === 'touch' || this.gear.busy()) return;
    this.drag.set({
      item,
      from,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      pointerId: event.pointerId,
    });
  }

  protected onPointerMove(event: PointerEvent): void {
    const d = this.drag();
    if (!d || event.pointerId !== d.pointerId) return;
    const moved = Math.hypot(event.clientX - d.startX, event.clientY - d.startY);
    if (!d.active && moved < 6) return;
    if (!d.active) {
      this.sound.play('click');
      // Während des Ziehens keinen Text markieren
      this.document.documentElement.classList.add('tbca-dragging');
      this.document.getSelection()?.removeAllRanges();
    }
    this.drag.set({ ...d, x: event.clientX, y: event.clientY, active: true });
    this.over.set(this.dropTarget(event.clientX, event.clientY, d));
    event.preventDefault();
  }

  protected async onPointerUp(event: PointerEvent): Promise<void> {
    const d = this.drag();
    if (!d || event.pointerId !== d.pointerId) return;
    const target = d.active ? this.dropTarget(event.clientX, event.clientY, d) : null;
    const wasActive = d.active;
    this.cancelDrag();
    if (!wasActive) return;
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false), 0);
    if (target === 'inventory' && d.from) await this.unequip(d.from);
    else if (target && target !== 'inventory') await this.equip(d.item, target, d.from);
  }

  protected cancelDrag(): void {
    this.document.documentElement.classList.remove('tbca-dragging');
    this.drag.set(null);
    this.over.set(null);
  }

  private dropTarget(x: number, y: number, d: Drag): EquipSlot | 'inventory' | null {
    const el = this.document.elementFromPoint?.(x, y)?.closest('[data-drop]');
    const value = el?.getAttribute('data-drop');
    if (!value) return null;
    if (value === 'inventory') return d.from ? 'inventory' : null;
    const slot = value as EquipSlot;
    if (slot === d.from || !this.gear.fits(d.item, slot)) return null;
    return slot;
  }

  private consumeClick(): boolean {
    if (!this.suppressClick) return false;
    this.suppressClick = false;
    return true;
  }
}
