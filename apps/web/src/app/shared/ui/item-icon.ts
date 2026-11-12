import { Component, computed, input } from '@angular/core';
import { ICON_VIEWBOX, SLOT_GLYPHS, circuitTrace, itemGlyph, tierOf } from '@tbca/assets';
import type { ItemData } from '@tbca/game-core';

/**
 * Prozedurales Item-Icon: Grundglyphe der Vorlage, Leiterbahnen aus der Item-ID, Rahmen und
 * Leuchten nach Tier. Ohne Item zeigt es den leeren Platz gestrichelt.
 */
@Component({
  selector: 'tbca-item-icon',
  template: `
    <span
      class="tbca-ibox"
      [class]="tierClass()"
      [class.tbca-ibox--empty]="!item()"
      [class.tbca-ibox--blocked]="blocked()"
      [style.--ib.px]="size()"
      aria-hidden="true"
    >
      <svg [attr.viewBox]="viewBox">
        <path class="glyph" [attr.d]="glyph()" />
        @if (trace(); as t) {
          <path class="trace" [attr.d]="t" />
        }
      </svg>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class ItemIcon {
  /** Item mit ID (für die Leiterbahnen); null = leerer Platz. */
  readonly item = input<(ItemData & { id?: string }) | null>(null);
  /** Platz, dessen Glyphe ein leeres Feld zeigt. */
  readonly slot = input<string | null>(null);
  readonly size = input(62);
  readonly blocked = input(false);

  protected readonly viewBox = ICON_VIEWBOX;
  protected readonly tierClass = computed(() => {
    const item = this.item();
    return 'tbca-ibox tier-' + (item ? tierOf(Math.max(1, item.rarity)) : 0);
  });
  protected readonly glyph = computed(() => {
    const item = this.item();
    if (item) return itemGlyph(item.templateId, item.category);
    return SLOT_GLYPHS[this.slot() ?? 'core_implant'] ?? SLOT_GLYPHS['core_implant']!;
  });
  protected readonly trace = computed(() => {
    const item = this.item();
    return item
      ? circuitTrace(item.id ?? `${item.templateId}:${item.rarity}:${item.budget}`)
      : null;
  });
}
