import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { CONSUMABLES, type ConsumableId, type GameConfig, type ShopRules } from '@tbca/game-core';
import type { AdminConfigList, AdminConfigVersion } from '@tbca/shared';

import { AdminService } from '../../core/admin.service';
import { ApiFailure } from '../../core/api-failure';

type NumberField = Exclude<keyof ShopRules, 'consumables'>;

/** Zahlenfelder des Shops mit Grenzen für die Eingabe. */
const FIELDS: { key: NumberField; min: number; max: number; step: number }[] = [
  { key: 'rotationSize', min: 0, max: 12, step: 1 },
  { key: 'rotationMaxRarity', min: 1, max: 16, step: 1 },
  { key: 'priceCreditsPerBudget', min: 1, max: 100, step: 1 },
  { key: 'sellPermille', min: 0, max: 1000, step: 10 },
  { key: 'renameCredits', min: 0, max: 100000, step: 10 },
  { key: 'renameCooldownDays', min: 0, max: 365, step: 1 },
];

/**
 * Shop-Editor (Spezifikation, Abschnitt 14): Verbrauchsgüter mit Preisen, Tagesrotation und
 * Verkaufsanteil als Formular. Bearbeitet wird der Konfigurationsentwurf; Prüfung und
 * Veröffentlichung laufen wie im Item-Editor über die versionierte Konfiguration.
 */
@Component({
  selector: 'tbca-shop-editor-page',
  imports: [TranslocoDirective, RouterLink],
  templateUrl: './shop-editor.page.html',
  styleUrls: ['./item-editor.page.css', './shop-editor.page.css'],
})
export class ShopEditorPage {
  private readonly api = inject(AdminService);

  protected readonly fields = FIELDS;
  protected readonly consumableIds = CONSUMABLES;
  protected readonly list = signal<AdminConfigList | null>(null);
  protected readonly draft = signal<AdminConfigVersion | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly problems = signal<string[]>([]);
  protected readonly notice = signal<string | null>(null);
  protected readonly dirty = signal(false);

  protected readonly shop = computed(
    () => (this.draft()?.data.game as unknown as GameConfig | undefined)?.shop ?? null,
  );
  protected readonly editable = computed(() => this.draft()?.status === 'draft');
  /** Beispielpreis für ein Item mit Power-Budget 100 und was der Verkauf davon zurückbringt. */
  protected readonly example = computed(() => {
    const s = this.shop();
    if (!s) return null;
    const price = 100 * s.priceCreditsPerBudget;
    return { price, sell: Math.floor((price * s.sellPermille) / 1000) };
  });

  constructor() {
    void this.load();
  }

  protected priceOf(id: ConsumableId): number | null {
    return this.shop()?.consumables.find((c) => c.id === id)?.price ?? null;
  }

  protected async load(): Promise<void> {
    await this.run(async () => {
      const list = await this.api.configs();
      this.list.set(list);
      const v =
        list.versions.find((x) => x.status === 'draft') ??
        list.versions.find((x) => x.status === 'published');
      if (v) await this.open(v.version);
    });
  }

  protected async open(version: number): Promise<void> {
    this.draft.set(await this.api.config(version));
    this.dirty.set(false);
  }

  protected createDraft(): Promise<void> {
    return this.run(async () => {
      const v = await this.api.createDraft(null, null);
      this.list.set(await this.api.configs());
      await this.open(v.version);
    });
  }

  protected setNumber(key: NumberField, raw: string): void {
    const value = Math.round(Number(raw));
    if (!Number.isFinite(value)) return;
    this.patch((shop) => ({ ...shop, [key]: value }));
  }

  /** Verbrauchsgut anbieten (mit Preis) oder aus dem Shop nehmen (leer). */
  protected setPrice(id: ConsumableId, raw: string): void {
    const value = Math.round(Number(raw));
    this.patch((shop) => {
      const rest = shop.consumables.filter((c) => c.id !== id);
      const consumables =
        raw.trim() === '' || !Number.isFinite(value) ? rest : [...rest, { id, price: value }];
      // Reihenfolge wie in der Liste der Verbrauchsgüter
      consumables.sort((a, b) => CONSUMABLES.indexOf(a.id) - CONSUMABLES.indexOf(b.id));
      return { ...shop, consumables };
    });
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

  private patch(fn: (shop: ShopRules) => ShopRules): void {
    const draft = this.draft();
    const shop = this.shop();
    if (!draft || !shop || !this.editable()) return;
    const game = { ...(draft.data.game as unknown as GameConfig), shop: fn(shop) };
    this.draft.set({
      ...draft,
      data: { ...draft.data, game: game as unknown as Record<string, unknown> },
    });
    this.dirty.set(true);
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
