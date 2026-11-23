import { KeyValuePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ATTRIBUTES,
  ITEM_STATS,
  rarityTier,
  templatePreview,
  type GameConfig,
  type ItemCategory,
  type ItemStat,
  type ItemTemplate,
} from '@tbca/game-core';
import type { AdminConfigList, AdminConfigVersion } from '@tbca/shared';

import { AdminService } from '../../core/admin.service';
import { ApiFailure } from '../../core/api-failure';

const CATEGORIES: ItemCategory[] = [
  'head',
  'torso',
  'legs',
  'feet',
  'hands',
  'weapon_1h',
  'weapon_2h',
  'shield',
  'implant',
  'core_implant',
];
const BASE_KEYS = ['weaponDamage', ...ITEM_STATS] as const;

/**
 * Item-Editor (Spezifikation, Abschnitt 13): Vorlagen eines Konfigurations-Entwurfs bearbeiten,
 * mit Live-Anzeige von Power-Budget, Basiswerten und Affix-Bereichen; speichern prüft der Server.
 */
@Component({
  selector: 'tbca-item-editor-page',
  imports: [TranslocoDirective, RouterLink, KeyValuePipe],
  templateUrl: './item-editor.page.html',
  styleUrl: './item-editor.page.css',
})
export class ItemEditorPage {
  private readonly api = inject(AdminService);

  protected readonly categories = CATEGORIES;
  protected readonly baseKeys = BASE_KEYS;
  protected readonly stats = ITEM_STATS;
  protected readonly attributes = ATTRIBUTES;

  protected readonly list = signal<AdminConfigList | null>(null);
  protected readonly draft = signal<AdminConfigVersion | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly level = signal(30);
  protected readonly rarity = signal(6);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly problems = signal<string[]>([]);
  protected readonly notice = signal<string | null>(null);
  protected readonly json = signal('');
  protected readonly dirty = signal(false);

  protected readonly game = computed(
    () => this.draft()?.data.game as unknown as GameConfig | undefined,
  );
  protected readonly templates = computed(() => this.game()?.items.templates ?? []);
  protected readonly selected = computed(
    () => this.templates().find((t) => t.id === this.selectedId()) ?? null,
  );
  protected readonly editable = computed(() => this.draft()?.status === 'draft');
  protected readonly preview = computed(() => {
    const game = this.game();
    const t = this.selected();
    if (!game || !t) return null;
    try {
      return templatePreview(game, t, this.level(), this.rarity());
    } catch {
      return null;
    }
  });
  protected readonly tier = computed(() => Math.min(6, rarityTier(this.rarity())));

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    await this.run(async () => {
      const list = await this.api.configs();
      this.list.set(list);
      const draft =
        list.versions.find((v) => v.status === 'draft') ??
        list.versions.find((v) => v.status === 'published');
      if (draft) await this.open(draft.version);
    });
  }

  protected async open(version: number): Promise<void> {
    const v = await this.api.config(version);
    this.draft.set(v);
    this.json.set(JSON.stringify(v.data, null, 2));
    this.dirty.set(false);
    this.selectedId.set(
      this.selectedId() ?? (v.data.game as unknown as GameConfig).items.templates[0]?.id ?? null,
    );
  }

  protected createDraft(): Promise<void> {
    return this.run(async () => {
      const v = await this.api.createDraft(null, null);
      this.list.set(await this.api.configs());
      await this.open(v.version);
    });
  }

  /** Ändert die ausgewählte Vorlage im lokalen Entwurf. */
  protected update(patch: Partial<ItemTemplate>): void {
    const draft = this.draft();
    const t = this.selected();
    if (!draft || !t) return;
    const game = structuredClone(draft.data.game) as unknown as GameConfig;
    const templates = game.items.templates.map((x) => (x.id === t.id ? { ...x, ...patch } : x));
    (game.items as unknown as { templates: ItemTemplate[] }).templates = templates;
    this.draft.set({
      ...draft,
      data: { ...draft.data, game: game as unknown as Record<string, unknown> },
    });
    if (patch.id) this.selectedId.set(patch.id);
    this.json.set(JSON.stringify(this.draft()!.data, null, 2));
    this.dirty.set(true);
  }

  protected setCategory(category: ItemCategory): void {
    const weapon = category === 'weapon_1h' || category === 'weapon_2h';
    this.update({
      category,
      ...(weapon
        ? {
            weapon: this.selected()?.weapon ?? {
              kind: 'physical',
              scalesWith: 'str',
              scaling: 9000,
            },
            base: { weaponDamage: 1 },
          }
        : { weapon: undefined }),
    } as Partial<ItemTemplate>);
  }

  protected setWeight(key: string, raw: string): void {
    const base = { ...(this.selected()?.base ?? {}) } as Record<string, number>;
    const value = Math.max(0, Math.round(Number(raw) || 0));
    if (value === 0) delete base[key];
    else base[key] = value;
    this.update({ base });
  }

  protected toggleAffix(stat: ItemStat): void {
    const pool = this.selected()?.affixPool ?? [];
    this.update({
      affixPool: pool.includes(stat) ? pool.filter((s) => s !== stat) : [...pool, stat],
    });
  }

  protected setWeapon(patch: Partial<NonNullable<ItemTemplate['weapon']>>): void {
    const weapon = this.selected()?.weapon;
    if (weapon) this.update({ weapon: { ...weapon, ...patch } });
  }

  protected addTemplate(): void {
    const draft = this.draft();
    if (!draft) return;
    const game = structuredClone(draft.data.game) as unknown as GameConfig;
    let id = 'new_item';
    for (let i = 2; game.items.templates.some((t) => t.id === id); i++) id = `new_item_${i}`;
    (game.items as unknown as { templates: ItemTemplate[] }).templates = [
      ...game.items.templates,
      { id, category: 'torso', base: { armor: 1 }, affixPool: ['con', 'maxHp'] },
    ];
    this.draft.set({
      ...draft,
      data: { ...draft.data, game: game as unknown as Record<string, unknown> },
    });
    this.selectedId.set(id);
    this.dirty.set(true);
  }

  protected removeTemplate(): void {
    const draft = this.draft();
    const t = this.selected();
    if (!draft || !t) return;
    const game = structuredClone(draft.data.game) as unknown as GameConfig;
    (game.items as unknown as { templates: ItemTemplate[] }).templates =
      game.items.templates.filter((x) => x.id !== t.id);
    this.draft.set({
      ...draft,
      data: { ...draft.data, game: game as unknown as Record<string, unknown> },
    });
    this.selectedId.set(game.items.templates[0]?.id ?? null);
    this.dirty.set(true);
  }

  /** Übernimmt die erweiterte JSON-Bearbeitung in den Entwurf. */
  protected applyJson(): void {
    const draft = this.draft();
    if (!draft) return;
    try {
      const data = JSON.parse(this.json()) as AdminConfigVersion['data'];
      this.draft.set({ ...draft, data });
      this.dirty.set(true);
      this.problems.set([]);
    } catch (e) {
      this.problems.set([`JSON: ${(e as Error).message}`]);
    }
  }

  protected save(): Promise<void> {
    const draft = this.draft();
    if (!draft) return Promise.resolve();
    return this.run(async () => {
      this.draft.set(await this.api.saveConfig(draft.version, draft.data, draft.notes));
      this.dirty.set(false);
      this.notice.set('admin.items.saved');
    });
  }

  protected publish(): Promise<void> {
    const draft = this.draft();
    if (!draft) return Promise.resolve();
    return this.run(async () => {
      if (this.dirty()) await this.api.saveConfig(draft.version, draft.data, draft.notes);
      this.list.set(await this.api.publishConfig(draft.version));
      await this.open(draft.version);
      this.notice.set('admin.items.published');
    });
  }

  protected weightOf(key: string): number {
    return (this.selected()?.base as Record<string, number> | undefined)?.[key] ?? 0;
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.problems.set([]);
    try {
      await fn();
    } catch (error) {
      const failure = error instanceof ApiFailure ? error : null;
      this.error.set(failure?.code ?? 'unknown');
      const problems = (failure?.details as { problems?: string[] } | undefined)?.problems;
      if (problems) this.problems.set(problems);
    } finally {
      this.busy.set(false);
    }
  }
}
