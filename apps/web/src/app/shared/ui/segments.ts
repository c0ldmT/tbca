import { Component, computed, input } from '@angular/core';

/** Zähler aus schrägen Segmenten (z. B. belohnte Kämpfe, Runs, Aufwertung). */
@Component({
  selector: 'tbca-segments',
  template: `
    <span class="tbca-segs" [class]="variantClass()" [style.--sh.px]="height()" aria-hidden="true">
      @for (s of segments(); track $index) {
        <i [class]="s"></i>
      }
    </span>
  `,
  styles: `
    :host {
      display: block;
    }
    .tbca-segs {
      display: grid;
    }
  `,
})
export class Segments {
  readonly total = input.required<number>();
  readonly filled = input.required<number>();
  /** Das nächste freie Segment pulsiert. */
  readonly pulseNext = input(true);
  readonly variant = input<'cyan' | 'y' | 'g'>('cyan');
  readonly height = input(10);

  protected readonly variantClass = computed(() =>
    this.variant() === 'cyan' ? 'tbca-segs' : `tbca-segs tbca-segs--${this.variant()}`,
  );
  protected readonly segments = computed(() =>
    Array.from({ length: Math.max(0, this.total()) }, (_, i) =>
      i < this.filled() ? 'f' : i === this.filled() && this.pulseNext() ? 'n' : '',
    ),
  );
}
