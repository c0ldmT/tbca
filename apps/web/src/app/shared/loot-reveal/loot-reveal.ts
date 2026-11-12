import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { ItemData } from '@tbca/game-core';

import { SoundService } from '../../core/sound.service';
import { statLabel } from '../item-format';
import { tier } from '../item-format';
import { ItemIcon } from '../ui/item-icon';
import { Stars } from '../ui/stars';

/**
 * Loot-Reveal nach Rarität (Spezifikation, Abschnitt 18): jede Datenkapsel öffnet sich einzeln,
 * mit wachsenden Effekten je Tier – Glow, Scanlines, Glitch, RGB-Split und Partikel, ab Tier 6
 * holografisch mit vollem Klang. Am Ende eine Übersicht aller Items.
 */
@Component({
  selector: 'tbca-loot-reveal',
  imports: [TranslocoDirective, ItemIcon, Stars],
  templateUrl: './loot-reveal.html',
  styleUrl: './loot-reveal.css',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-label]': 'title()',
    '(keydown.escape)': 'closed.emit()',
  },
})
export class LootReveal {
  private readonly sound = inject(SoundService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly items = input.required<readonly ItemData[]>();
  readonly credits = input(0);
  readonly title = input('');
  readonly closed = output<void>();

  protected readonly index = signal(0);
  protected readonly open = signal(false);
  protected readonly summary = signal(false);
  protected readonly particles = Array.from({ length: 8 }, (_, i) => i + 1);

  protected readonly current = computed(() => this.items()[this.index()] ?? null);
  protected readonly currentTier = computed(() => tier(this.current()?.rarity ?? 1));
  protected readonly last = computed(() => this.index() >= this.items().length - 1);
  protected readonly label = statLabel;

  constructor() {
    afterNextRender(() => this.host.querySelector<HTMLElement>('.go')?.focus());
  }

  protected reveal(): void {
    if (!this.open()) {
      this.open.set(true);
      this.sound.play('drop', this.currentTier());
      return;
    }
    if (this.last()) {
      this.summary.set(true);
      return;
    }
    this.open.set(false);
    this.index.update((i) => i + 1);
  }

  protected showAll(): void {
    this.summary.set(true);
  }

  protected tierOf(rarity: number): number {
    return tier(rarity);
  }

  protected affixCount(item: ItemData): number {
    return item.affixes.length;
  }
}
