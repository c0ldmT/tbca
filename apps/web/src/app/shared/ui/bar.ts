import { Component, computed, input } from '@angular/core';

export type BarVariant = 'cyan' | 'hp' | 'en' | 'xp' | 'y' | 'tier' | 'auto-hp';

/**
 * Abgekanteter Balken (Parallelogramm). `ghost` zeigt den vorherigen Wert als Nachlauf,
 * `extra` einen zweiten Anteil dahinter (z. B. Attribute aus Items).
 */
@Component({
  selector: 'tbca-bar',
  template: `
    <span
      class="tbca-bar"
      [class]="classes()"
      [style.--bh.px]="height()"
      [style.--bk.px]="slant()"
      aria-hidden="true"
    >
      <span class="tbca-bar__t">
        @if (extra() !== null) {
          <span class="tbca-bar__i" [style.width.%]="pct(extra()!)"></span>
        }
        @if (ghost() !== null) {
          <span class="tbca-bar__g" [style.width.%]="pct(ghost()!)"></span>
        }
        <span class="tbca-bar__f" [style.width.%]="pct(value())"></span>
        @if (shield() > 0) {
          <span class="tbca-bar__s" [style.width.%]="pct(shield())"></span>
        }
      </span>
    </span>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class Bar {
  readonly value = input.required<number>();
  readonly max = input(100);
  readonly ghost = input<number | null>(null);
  readonly extra = input<number | null>(null);
  readonly shield = input(0);
  readonly variant = input<BarVariant>('cyan');
  readonly seg = input(false);
  readonly height = input(8);
  readonly slant = input(5);

  protected readonly classes = computed(() => {
    let variant: string = this.variant();
    if (variant === 'auto-hp') variant = this.pct(this.value()) < 30 ? 'low' : 'hp';
    return [
      'tbca-bar',
      variant === 'cyan' ? '' : `tbca-bar--${variant}`,
      this.seg() ? 'tbca-bar--seg' : '',
    ].join(' ');
  });

  protected pct(v: number): number {
    const max = this.max();
    return max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0;
  }
}
