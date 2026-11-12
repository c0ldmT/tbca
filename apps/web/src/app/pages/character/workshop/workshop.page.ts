import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  MATERIALS,
  effectiveItem,
  findTemplate,
  rerollCost,
  salvageYield,
  transferCost,
  upgradeCost,
  type ItemStat,
  type MaterialId,
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
import { Bar } from '../../../shared/ui/bar';
import { ItemIcon } from '../../../shared/ui/item-icon';
import { Segments } from '../../../shared/ui/segments';
import { Stars } from '../../../shared/ui/stars';
import { GearState } from '../gear/gear-state';
import { ItemNamePipe } from '../../../shared/item-name';

type Op = 'upgrade' | 'reroll' | 'transfer' | 'salvage';
type ListFilter = 'all' | 'equipped' | 'inventory';

const OPS: { id: Op; icon: string }[] = [
  { id: 'upgrade', icon: 'M12 19V5 M5 12l7-7 7 7' },
  {
    id: 'reroll',
    icon: 'M4 12a8 8 0 0 1 14-5 M20 12a8 8 0 0 1-14 5 M18 3v4h-4 M6 21v-4h4',
  },
  { id: 'transfer', icon: 'M4 8h13l-3-3 M20 16H7l3 3' },
  { id: 'salvage', icon: 'M4 4l16 16 M20 4L4 20 M9 4h6 M4 15v5h5' },
];

interface LogEntry {
  tone: 'ok' | 'bad' | '';
  text: string;
}

/**
 * Werkstatt – der einzige Ort fürs Crafting: Aufwerten, Affix neu würfeln, Affix übertragen und
 * Zerlegen (auch mehrere Items auf einmal). Kosten und Chancen rechnet game-core vor; der Server
 * entscheidet.
 */
@Component({
  selector: 'tbca-workshop-page',
  imports: [TranslocoDirective, ItemIcon, Stars, Segments, Bar, ItemNamePipe],
  templateUrl: './workshop.page.html',
  styleUrl: './workshop.page.css',
})
export class WorkshopPage {
  protected readonly gear = inject(GearState);
  private readonly characters = inject(CharacterService);
  private readonly economy = inject(EconomyService);
  private readonly gameConfig = inject(GameConfigService);
  private readonly sound = inject(SoundService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly ops = OPS;
  protected readonly materials = MATERIALS;
  protected readonly locale = this.language.current;
  protected readonly filters: ListFilter[] = ['all', 'equipped', 'inventory'];

  protected readonly op = signal<Op>('upgrade');
  protected readonly filter = signal<ListFilter>('all');
  protected readonly pickedId = signal<string | null>(null);
  protected readonly salvageIds = signal<ReadonlySet<string>>(new Set());
  protected readonly rerollStat = signal<ItemStat | null>(null);
  protected readonly lastReroll = signal<string | null>(null);
  protected readonly donorId = signal<string | null>(null);
  protected readonly donorStat = signal<ItemStat | null>(null);
  protected readonly flash = signal<{ ok: boolean; text: string; tick: number } | null>(null);
  protected readonly log = signal<LogEntry[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly config = computed(() => this.gameConfig.current()?.game ?? null);
  protected readonly credits = computed(() => this.characters.state()?.credits ?? 0);

  constructor() {
    // Aus dem Item-Detail: ?item=<id> wählt das Item vor.
    effect(() => {
      const id = this.query()?.get('item');
      if (id) untracked(() => this.pick(id));
    });
  }

  protected readonly list = computed(() => {
    const filter = this.filter();
    return this.gear
      .items()
      .filter((i) =>
        filter === 'equipped'
          ? i.equippedIn !== null
          : filter === 'inventory'
            ? i.equippedIn === null
            : true,
      )
      .sort(
        (a, b) =>
          (b.equippedIn ? 1 : 0) - (a.equippedIn ? 1 : 0) ||
          b.rarity - a.rarity ||
          b.itemLevel - a.itemLevel,
      );
  });

  protected readonly item = computed<ItemView | null>(() => {
    const byId = this.gear.byId();
    const picked = this.pickedId();
    if (picked && byId.has(picked)) return byId.get(picked)!;
    return this.gear.equipped('main_hand') ?? this.gear.items()[0] ?? null;
  });

  protected readonly view = computed(() => {
    const item = this.item();
    const config = this.config();
    if (!item || !config) return null;
    const shown = effectiveItem(config, item);
    return {
      item,
      tier: tier(item.rarity),
      up: item.upgrade ?? 0,
      power: shown.budget.toLocaleString(this.locale()),
      affixCount: item.affixes.length,
    };
  });

  // ----- Aufwerten -----
  protected readonly upgrade = computed(() => {
    const item = this.item();
    const config = this.config();
    if (!item || !config) return null;
    const up = item.upgrade ?? 0;
    const locale = this.locale();
    // Bei Höchststufe wirft upgradeCost – dann gibt es keine Kosten mehr
    let cost: ReturnType<typeof upgradeCost> | null;
    try {
      cost = upgradeCost(config, item);
    } catch {
      cost = null;
    }
    const now = effectiveItem(config, item);
    const after = effectiveItem(config, { ...item, upgrade: up + 1 });
    const rows = [
      ...Object.keys(now.base).map((stat) => ({
        stat,
        now: statValue(stat, now.base[stat as ItemStat] ?? 0, locale),
        after: statValue(stat, after.base[stat as ItemStat] ?? 0, locale),
      })),
      ...now.affixes.map((a, i) => ({
        stat: a.stat as string,
        now: statValue(a.stat, a.value, locale),
        after: statValue(a.stat, after.affixes[i]!.value, locale),
      })),
    ];
    const chance = cost ? Math.round(cost.successPermille / 10) : 0;
    const [material, amount] = (cost ? Object.entries(cost.materials)[0] : undefined) ?? [
      'scrap',
      0,
    ];
    const have = this.gear.stacks()[material] ?? 0;
    return {
      maxed: !cost,
      next: up + 1,
      chance,
      rows,
      credits: cost?.credits ?? 0,
      material: material as MaterialId,
      amount: amount ?? 0,
      enoughCredits: !!cost && this.credits() >= cost.credits,
      enoughMaterial: have >= (amount ?? 0),
      failTo: Math.max(0, up - 1),
    };
  });

  // ----- Neu würfeln -----
  protected readonly reroll = computed(() => {
    const item = this.item();
    const config = this.config();
    if (!item || !config) return null;
    const selected = this.rerollStat() ?? item.affixes[0]?.stat ?? null;
    const others = new Set(item.affixes.filter((a) => a.stat !== selected).map((a) => a.stat));
    const pool = findTemplate(config, item.templateId).affixPool.filter((s) => !others.has(s));
    const cost = rerollCost(config, item);
    const [material, amount] = Object.entries(cost.materials)[0] ?? ['circuits', 0];
    const shown = effectiveItem(config, item);
    return {
      selected,
      pool,
      rows: item.affixes.map((a, i) => ({
        stat: a.stat,
        value: statValue(a.stat, shown.affixes[i]!.value, this.locale()),
        quality: qualityPercent(affixQuality(config, item, a.stat, a.value)),
      })),
      credits: cost.credits,
      material: material as MaterialId,
      amount: amount ?? 0,
      enoughCredits: this.credits() >= cost.credits,
      enoughMaterial: (this.gear.stacks()[material] ?? 0) >= (amount ?? 0),
    };
  });

  // ----- Übertragen -----
  protected readonly transfer = computed(() => {
    const item = this.item();
    const config = this.config();
    if (!item || !config) return null;
    const pool = new Set(findTemplate(config, item.templateId).affixPool);
    const present = new Set(item.affixes.map((a) => a.stat));
    const donors = this.gear
      .items()
      .filter((d) => d.id !== item.id && d.equippedIn === null)
      .filter((d) => d.affixes.some((a) => pool.has(a.stat) && !present.has(a.stat)));
    const donor = donors.find((d) => d.id === this.donorId()) ?? null;
    const cost = transferCost(config, item);
    return {
      full: cost.successPermille === 0,
      chance: Math.round(cost.successPermille / 10),
      credits: cost.credits,
      enoughCredits: this.credits() >= cost.credits,
      donors,
      donor,
      affixes: donor
        ? donor.affixes.map((a) => ({
            stat: a.stat,
            value: statValue(a.stat, a.value, this.locale()),
            quality: qualityPercent(affixQuality(config, donor, a.stat, a.value)),
            problem: !pool.has(a.stat) ? 'notAllowed' : present.has(a.stat) ? 'present' : null,
          }))
        : [],
    };
  });

  // ----- Zerlegen -----
  protected readonly salvage = computed(() => {
    const config = this.config();
    const ids = this.salvageIds();
    const total: Record<string, number> = { scrap: 0, circuits: 0, quantum_cores: 0 };
    let count = 0;
    if (config) {
      for (const item of this.gear.items()) {
        if (!ids.has(item.id) || item.equippedIn) continue;
        count++;
        for (const [m, n] of Object.entries(salvageYield(config, item))) total[m]! += n ?? 0;
      }
    }
    return { count, total };
  });

  // ----- Auswahl -----

  protected pick(id: string): void {
    this.pickedId.set(id);
    this.rerollStat.set(null);
    this.lastReroll.set(null);
    this.donorId.set(null);
    this.donorStat.set(null);
    this.flash.set(null);
  }

  protected clickListItem(item: ItemView): void {
    this.sound.play('click');
    if (this.op() !== 'salvage') {
      this.pick(item.id);
      return;
    }
    if (item.equippedIn) return;
    this.salvageIds.update((set) => {
      const next = new Set(set);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  protected setOp(op: Op): void {
    this.sound.play('click');
    this.op.set(op);
    this.flash.set(null);
    this.error.set(null);
  }

  protected selectRange(min: number, max: number): void {
    this.salvageIds.set(
      new Set(
        this.gear
          .items()
          .filter((i) => i.equippedIn === null && i.rarity >= min && i.rarity <= max)
          .map((i) => i.id),
      ),
    );
  }

  protected clearSalvage(): void {
    this.salvageIds.set(new Set());
  }

  protected tierOf(rarity: number): number {
    return tier(rarity);
  }

  protected stat(stat: string, t: (k: string, p?: Record<string, unknown>) => string): string {
    return statLabel(stat, t);
  }

  // ----- Aktionen -----

  protected doUpgrade(): Promise<void> {
    const item = this.item();
    if (!item) return Promise.resolve();
    const before = item.upgrade ?? 0;
    return this.act(async () => {
      const r = await this.economy.upgrade(item.id);
      const level = r.item?.upgrade ?? before;
      const name = this.name(item);
      this.show(
        r.success,
        this.tr(r.success ? 'workshop.flashUp' : 'workshop.flashFail', { level }),
      );
      this.addLog(
        r.success ? 'ok' : 'bad',
        this.tr(r.success ? 'workshop.logUp' : 'workshop.logUpFail', {
          item: name,
          from: before,
          to: level,
        }),
      );
    });
  }

  protected doReroll(): Promise<void> {
    const item = this.item();
    const r = this.reroll();
    const stat = r?.selected;
    if (!item || !stat) return Promise.resolve();
    const config = this.config()!;
    const oldQuality = affixQuality(
      config,
      item,
      stat,
      item.affixes.find((a) => a.stat === stat)!.value,
    );
    return this.act(async () => {
      const res = await this.economy.reroll(item.id, stat);
      const index = item.affixes.findIndex((a) => a.stat === stat);
      const next = res.item?.affixes[index];
      if (!next || !res.item) return;
      const quality = affixQuality(config, res.item, next.stat, next.value);
      const text = this.tr('workshop.rerollResult', {
        from: this.statName(stat),
        to: this.statName(next.stat),
        value: statValue(next.stat, next.value, this.locale()),
        quality: Math.round(quality / 10),
      });
      this.rerollStat.set(next.stat);
      this.lastReroll.set(text);
      this.show(
        quality >= oldQuality,
        this.tr('workshop.flashQuality', { quality: Math.round(quality / 10) }),
      );
      this.addLog(quality >= oldQuality ? 'ok' : 'bad', `${this.name(item)}: ${text}`);
    });
  }

  protected doTransfer(): Promise<void> {
    const item = this.item();
    const t = this.transfer();
    const donor = t?.donor;
    const stat = this.donorStat();
    if (!item || !donor || !stat) return Promise.resolve();
    return this.act(async () => {
      const r = await this.economy.transfer(item.id, donor.id, stat);
      this.donorId.set(null);
      this.donorStat.set(null);
      this.show(
        r.success,
        this.tr(r.success ? 'workshop.flashTransfer' : 'workshop.flashFailShort'),
      );
      this.addLog(
        r.success ? 'ok' : 'bad',
        this.tr(r.success ? 'workshop.logTransfer' : 'workshop.logTransferFail', {
          stat: this.statName(stat),
          donor: this.name(donor),
          item: this.name(item),
        }),
      );
    });
  }

  protected async doSalvage(): Promise<void> {
    const ids = [...this.salvageIds()];
    if (ids.length === 0) return;
    const gained: Record<string, number> = {};
    await this.act(async () => {
      for (const id of ids) {
        const r = await this.economy.salvage(id);
        for (const [m, n] of Object.entries(r.gained)) gained[m] = (gained[m] ?? 0) + n;
        this.salvageIds.update((set) => {
          const next = new Set(set);
          next.delete(id);
          return next;
        });
      }
    });
    const text = Object.entries(gained)
      .map(([m, n]) =>
        this.tr('inventory.materialAmount', { amount: n, name: this.tr('materials.' + m) }),
      )
      .join(', ');
    if (text) this.addLog('', this.tr('workshop.logSalvage', { count: ids.length, gained: text }));
  }

  private async act(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
      this.sound.play('fail');
    } finally {
      this.busy.set(false);
      await this.gear.reload();
    }
  }

  private show(ok: boolean, text: string): void {
    this.sound.play(ok ? 'success' : 'fail');
    this.flash.update((f) => ({ ok, text, tick: (f?.tick ?? 0) + 1 }));
  }

  private addLog(tone: LogEntry['tone'], text: string): void {
    this.log.update((list) => [{ tone, text }, ...list].slice(0, 8));
  }

  private readonly itemName = new ItemNamePipe();

  private tr(key: string, params?: Record<string, unknown>): string {
    return this.transloco.translate(key, params);
  }

  private name(item: ItemView): string {
    return this.itemName.transform(item.templateId);
  }

  private statName(stat: string): string {
    return statLabel(stat, (k, p) => this.tr(k, p));
  }
}
