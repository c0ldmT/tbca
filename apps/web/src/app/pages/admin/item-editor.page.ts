import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  ATTRIBUTES,
  CURVE_POINTS,
  ITEM_STATS,
  exportItems,
  generateTemplate,
  importItems,
  rarityTier,
  rollItem,
  slug,
  stylesFor,
  templateCurveSummary,
  templatePreview,
  uniqueId,
  type GameConfig,
  type ItemCategory,
  type ItemData,
  type ItemImportResult,
  type ItemNameLocale,
  type ItemStat,
  type ItemStyle,
  type ItemTemplate,
} from '@tbca/game-core';
import type { AdminConfigList, AdminConfigVersion } from '@tbca/shared';

import { AdminService } from '../../core/admin.service';
import { ApiFailure } from '../../core/api-failure';
import { downloadJson } from '../../core/download';
import { LanguageService } from '../../core/language.service';
import { statLabel, statValue } from '../../shared/item-format';
import { itemDisplayName } from '../../shared/item-name';
import { ItemIcon } from '../../shared/ui/item-icon';

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
/** Abweichung von der Kurve (Promille), ab der eine Vorlage markiert wird. */
const CURVE_TOLERANCE = 50;

interface ListEntry {
  readonly tpl: ItemTemplate;
  readonly name: string;
  readonly ratio: number;
  readonly icon: ItemData | null;
  readonly live: boolean;
}

/**
 * Item-Editor (Spezifikation, Abschnitt 13): Vorlagen eines Konfigurations-Entwurfs mit Namen
 * (DE/EN), Basisgewichten, Affix-Pool und Waffenwerten bearbeiten. Live dazu: Vorschau der
 * Werte, Abgleich mit der Balancing-Kurve, ein Generator für neue Vorlagen und der Austausch
 * der Item-Werte als normierte Datei. Speichern prüft der Server.
 */
@Component({
  selector: 'tbca-item-editor-page',
  imports: [TranslocoDirective, RouterLink, ItemIcon],
  templateUrl: './item-editor.page.html',
  styleUrl: './item-editor.page.css',
})
export class ItemEditorPage {
  private readonly api = inject(AdminService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);

  protected readonly categories = CATEGORIES;
  protected readonly baseKeys = BASE_KEYS;
  protected readonly stats = ITEM_STATS;
  protected readonly attributes = ATTRIBUTES;
  protected readonly curvePoints = CURVE_POINTS;
  protected readonly locales: ItemNameLocale[] = ['de', 'en'];

  protected readonly list = signal<AdminConfigList | null>(null);
  protected readonly draft = signal<AdminConfigVersion | null>(null);
  /** IDs der veröffentlichten Version: Diese Vorlagen stecken in Items, ihre ID bleibt fest. */
  protected readonly liveIds = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedId = signal<string | null>(null);
  protected readonly level = signal(30);
  protected readonly rarity = signal(6);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly problems = signal<string[]>([]);
  protected readonly notice = signal<string | null>(null);
  protected readonly json = signal('');
  protected readonly dirty = signal(false);
  protected readonly query = signal('');
  protected readonly filter = signal<ItemCategory | 'all'>('all');
  protected readonly panel = signal<'edit' | 'generate' | 'exchange'>('edit');

  // Generator
  protected readonly genCategory = signal<ItemCategory>('torso');
  protected readonly genStyle = signal<ItemStyle | 'auto'>('auto');
  protected readonly genSeed = signal(randomSeed());

  // Austausch
  protected readonly importMode = signal<'merge' | 'replace'>('merge');
  protected readonly importRules = signal(false);
  protected readonly importResult = signal<ItemImportResult | null>(null);
  protected readonly importName = signal<string | null>(null);

  protected readonly game = computed(
    () => this.draft()?.data.game as unknown as GameConfig | undefined,
  );
  protected readonly templates = computed(() => this.game()?.items.templates ?? []);
  protected readonly selected = computed(
    () => this.templates().find((t) => t.id === this.selectedId()) ?? null,
  );
  protected readonly editable = computed(() => this.draft()?.status === 'draft');
  protected readonly locale = computed(() => this.language.current());

  /** Liste mit Anzeigenamen, Kurven-Abgleich und Icon, gefiltert nach Suche und Kategorie. */
  protected readonly entries = computed<ListEntry[]>(() => {
    const game = this.game();
    if (!game) return [];
    const q = this.query().trim().toLowerCase();
    const filter = this.filter();
    return this.templates()
      .map((tpl) => ({
        tpl,
        name: this.nameOf(tpl),
        ratio: safe(() => templateCurveSummary(game, tpl).ratioPermille, 0),
        icon: safe(
          () =>
            rollItem(game, {
              templateId: tpl.id,
              itemLevel: this.level(),
              rarity: this.rarity(),
              seed: 'editor',
            }),
          null,
        ),
        live: this.liveIds().has(tpl.id),
      }))
      .filter((e) => filter === 'all' || e.tpl.category === filter)
      .filter(
        (e) => !q || e.name.toLowerCase().includes(q) || e.tpl.id.includes(q.replace(/\s+/g, '_')),
      );
  });

  protected readonly preview = computed(() => {
    const game = this.game();
    const t = this.selected();
    if (!game || !t) return null;
    return safe(() => templatePreview(game, t, this.level(), this.rarity()), null);
  });
  protected readonly curve = computed(() => {
    const game = this.game();
    const t = this.selected();
    return game && t ? safe(() => templateCurveSummary(game, t), null) : null;
  });
  protected readonly tier = computed(() => Math.min(6, rarityTier(this.rarity())));
  /** Summe der Basisgewichte für die Prozent-Anzeige. */
  protected readonly weightTotal = computed(() =>
    Object.values(this.selected()?.base ?? {}).reduce((s, w) => s + (w ?? 0), 0),
  );

  /** Basiswerte mit Gewicht (Waffenschaden zuerst) und die übrigen zum Hinzufügen. */
  protected readonly activeWeights = computed(() => BASE_KEYS.filter((k) => this.weightOf(k) > 0));
  protected readonly inactiveWeights = computed(() =>
    BASE_KEYS.filter(
      (k) => this.weightOf(k) === 0 && (k !== 'weaponDamage' || Boolean(this.selected()?.weapon)),
    ),
  );

  protected readonly genStyles = computed(() => stylesFor(this.genCategory()));
  protected readonly generated = computed(() => {
    const game = this.game();
    if (!game) return null;
    const style = this.genStyle();
    return safe(
      () =>
        generateTemplate(game, {
          category: this.genCategory(),
          ...(style === 'auto' ? {} : { style }),
          seed: this.genSeed(),
        }),
      null,
    );
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    await this.run(async () => {
      const list = await this.api.configs();
      this.list.set(list);
      const published = list.versions.find((v) => v.status === 'published');
      if (published) {
        const live = await this.api.config(published.version);
        this.liveIds.set(
          new Set((live.data.game as unknown as GameConfig).items.templates.map((t) => t.id)),
        );
      }
      const draft = list.versions.find((v) => v.status === 'draft') ?? published;
      if (draft) await this.open(draft.version);
    });
  }

  protected async open(version: number): Promise<void> {
    const v = await this.api.config(version);
    this.draft.set(v);
    this.json.set(JSON.stringify(v.data, null, 2));
    this.dirty.set(false);
    const ids = (v.data.game as unknown as GameConfig).items.templates.map((t) => t.id);
    const current = this.selectedId();
    this.selectedId.set(current && ids.includes(current) ? current : (ids[0] ?? null));
  }

  /** Neuer Entwurf aus der veröffentlichten Version oder aus den Startwerten des Codes. */
  protected createDraft(from: 'published' | 'defaults' = 'published'): Promise<void> {
    return this.run(async () => {
      const v =
        from === 'defaults'
          ? await this.api.createDefaultsDraft(this.tr('admin.items.defaultsNote'))
          : await this.api.createDraft(null, null);
      this.list.set(await this.api.configs());
      await this.open(v.version);
      if (from === 'defaults') this.notice.set('admin.items.defaultsCreated');
    });
  }

  protected nameOf(tpl: ItemTemplate): string {
    return itemDisplayName(tpl.id, tpl, this.locale(), (key) => this.tr(key));
  }

  protected categoryLabel(c: ItemCategory): string {
    return this.tr('itemCategory.' + c);
  }

  protected statName(stat: string): string {
    return statLabel(stat, (k, p) => this.tr(k, p));
  }

  protected statText(stat: string, value: number): string {
    return statValue(stat, value, this.locale());
  }

  /** Kurven-Abgleich als Prozent mit Einordnung für die Farbe. */
  protected curveState(ratio: number): 'ok' | 'high' | 'low' {
    if (ratio > 1000 + CURVE_TOLERANCE) return 'high';
    if (ratio < 1000 - CURVE_TOLERANCE) return 'low';
    return 'ok';
  }

  /** Position auf der Skala 70–130 % in Prozent der Breite. */
  protected curvePos(ratio: number): number {
    return Math.max(0, Math.min(100, (ratio - 700) / 6));
  }

  protected percent(permille: number): string {
    return `${Math.round(permille / 10)} %`;
  }

  // --- Bearbeiten ----------------------------------------------------------------

  /** Ändert die ausgewählte Vorlage im lokalen Entwurf. */
  protected update(patch: Partial<ItemTemplate>): void {
    const t = this.selected();
    if (!t) return;
    this.setTemplates(this.templates().map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    if (patch.id) this.selectedId.set(patch.id);
  }

  /**
   * Name in einer Sprache. Bei noch nicht veröffentlichten Vorlagen folgt die ID dem Namen
   * (englisch bevorzugt), damit niemand IDs von Hand vergeben muss.
   */
  protected setName(locale: ItemNameLocale, value: string): void {
    const t = this.selected();
    if (!t) return;
    const names = { ...(t.names ?? {}), [locale]: value.trim() };
    if (!names[locale]) delete names[locale];
    const source = names.en ?? names.de;
    if (this.liveIds().has(t.id) || !source) {
      this.update({ names });
      return;
    }
    const others = {
      ...this.game()!,
      items: { ...this.game()!.items, templates: this.templates().filter((x) => x.id !== t.id) },
    };
    this.update({ names, id: uniqueId(others, slug(source)) });
  }

  protected setId(value: string): void {
    const t = this.selected();
    if (!t || this.liveIds().has(t.id)) return;
    this.update({ id: slug(value) });
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

  /** Skalierung als „Schaden je Attributpunkt“ (0,90) statt Festkomma (9000). */
  protected setPerPoint(raw: string): void {
    const value = Number(String(raw).replace(',', '.'));
    if (Number.isFinite(value) && value >= 0)
      this.setWeapon({ scaling: Math.round(value * 10_000) });
  }

  protected perPoint(scaling: number): string {
    return (scaling / 10_000).toFixed(3).replace(/0$/, '');
  }

  protected addTemplate(): void {
    const game = this.game();
    if (!game) return;
    const id = uniqueId(game, 'new_item');
    this.setTemplates([
      ...this.templates(),
      { id, category: 'torso', base: { armor: 1 }, affixPool: ['con', 'maxHp'] },
    ]);
    this.selectedId.set(id);
    this.panel.set('edit');
  }

  protected duplicate(): void {
    const game = this.game();
    const t = this.selected();
    if (!game || !t) return;
    const id = uniqueId(game, `${t.id}_copy`.slice(0, 36));
    const names = t.names
      ? Object.fromEntries(Object.entries(t.names).map(([l, n]) => [l, `${n} II`]))
      : undefined;
    this.setTemplates([
      ...this.templates(),
      { ...structuredClone(t), id, ...(names ? { names } : {}) },
    ]);
    this.selectedId.set(id);
  }

  protected removeTemplate(): void {
    const t = this.selected();
    if (!t) return;
    const rest = this.templates().filter((x) => x.id !== t.id);
    this.setTemplates(rest);
    this.selectedId.set(rest[0]?.id ?? null);
  }

  // --- Generator -------------------------------------------------------------------

  protected reroll(): void {
    this.genSeed.set(randomSeed());
  }

  protected setGenCategory(category: ItemCategory): void {
    this.genCategory.set(category);
    if (this.genStyle() !== 'auto' && !stylesFor(category).includes(this.genStyle() as ItemStyle))
      this.genStyle.set('auto');
  }

  protected adoptGenerated(): void {
    const g = this.generated();
    if (!g || !this.editable()) return;
    this.setTemplates([...this.templates(), g.template]);
    this.selectedId.set(g.template.id);
    this.panel.set('edit');
    this.reroll();
    this.notice.set('admin.items.gen.adopted');
  }

  // --- Austausch -------------------------------------------------------------------

  protected exportValues(): void {
    const game = this.game();
    const d = this.draft();
    if (!game || !d) return;
    downloadJson(
      `tbca-items-v${d.version}.json`,
      exportItems(game, { configVersion: d.version, exportedAt: new Date().toISOString() }),
    );
  }

  protected async chooseFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const game = this.game();
    if (!file || !game) return;
    this.importName.set(file.name);
    try {
      const doc: unknown = JSON.parse(await file.text());
      this.importResult.set(
        importItems(game, doc, { mode: this.importMode(), withRules: this.importRules() }),
      );
    } catch (e) {
      this.importResult.set({
        game,
        added: [],
        changed: [],
        removed: [],
        problems: [`JSON: ${(e as Error).message}`],
      });
    }
  }

  protected adoptImport(): void {
    const result = this.importResult();
    const draft = this.draft();
    if (!result || result.problems.length || !draft || !this.editable()) return;
    this.setGame(result.game);
    this.importResult.set(null);
    this.panel.set('edit');
    this.notice.set('admin.items.exchange.adopted');
  }

  // --- JSON, Speichern, Veröffentlichen ------------------------------------------------

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
      this.liveIds.set(new Set(this.templates().map((t) => t.id)));
      await this.open(draft.version);
      this.notice.set('admin.items.published');
    });
  }

  protected weightOf(key: string): number {
    return (this.selected()?.base as Record<string, number> | undefined)?.[key] ?? 0;
  }

  protected numberOf(event: Event): number {
    return +(event.target as HTMLInputElement).value;
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private setTemplates(templates: ItemTemplate[]): void {
    const game = this.game();
    if (!game) return;
    this.setGame({ ...game, items: { ...game.items, templates } });
  }

  private setGame(game: GameConfig): void {
    const draft = this.draft();
    if (!draft) return;
    this.draft.set({
      ...draft,
      data: { ...draft.data, game: structuredClone(game) as unknown as Record<string, unknown> },
    });
    this.json.set(JSON.stringify(this.draft()!.data, null, 2));
    this.dirty.set(true);
  }

  private tr(key: string, params?: Record<string, unknown>): string {
    return this.transloco.translate(key, params);
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

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function randomSeed(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
