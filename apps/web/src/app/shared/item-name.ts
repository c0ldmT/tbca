import { Pipe, inject, type PipeTransform } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { ItemTemplate } from '@tbca/game-core';

import { GameConfigService } from '../core/game-config.service';
import { LanguageService } from '../core/language.service';

/** „new_item_2“ → „New Item 2“: lesbarer Notname, wenn weder Name noch Übersetzung existiert. */
export function humanizeId(id: string): string {
  return id
    .split('_')
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Anzeigename einer Item-Vorlage: Name aus der Season-Konfiguration (im Item-Editor gepflegt),
 * sonst die Übersetzung `items.<id>`, sonst die lesbar gemachte ID.
 */
export function itemDisplayName(
  templateId: string,
  template: Pick<ItemTemplate, 'names'> | undefined,
  locale: string,
  translate: (key: string) => string,
): string {
  const names = template?.names;
  const own = names?.[locale as 'de' | 'en'] ?? names?.de ?? names?.en;
  if (own) return own;
  const key = `items.${templateId}`;
  const translated = translate(key);
  return translated && translated !== key ? translated : humanizeId(templateId);
}

/** `{{ item.templateId | itemName }}` – folgt Sprache und geladener Konfiguration. */
@Pipe({ name: 'itemName', pure: false })
export class ItemNamePipe implements PipeTransform {
  private readonly config = inject(GameConfigService);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  constructor() {
    void this.config.load().catch(() => undefined);
  }

  transform(templateId: string | null | undefined): string {
    if (!templateId) return '';
    const locale = this.language.current();
    const template = this.config.current()?.game.items.templates.find((t) => t.id === templateId);
    return itemDisplayName(templateId, template, locale, (key) =>
      this.transloco.translate(key, {}, locale),
    );
  }
}
