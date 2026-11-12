import { Component, computed, input } from '@angular/core';

const STAR = 'M5 .3 6.3 3.6 9.8 3.8 7.1 6 8 9.6 5 7.6 2 9.6 2.9 6 .2 3.8 3.7 3.6Z';

/** Rarität wie in PSO2: 9 Stern-Silhouetten, darüber Overflow in Tierfarbe. */
@Component({
  selector: 'tbca-stars',
  template: `
    <span class="tbca-stars" [style.--st.px]="size()">
      @for (on of stars(); track $index) {
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path [class]="on ? 'on' : 'off'" [attr.d]="path" />
        </svg>
      }
      @if (overflow() > 0) {
        <span class="tbca-stars__ovf" aria-hidden="true">+{{ overflow() }}</span>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class Stars {
  readonly rarity = input.required<number>();
  readonly size = input(15);

  protected readonly path = STAR;
  protected readonly stars = computed(() =>
    Array.from({ length: 9 }, (_, i) => i < Math.min(9, this.rarity())),
  );
  protected readonly overflow = computed(() => Math.max(0, this.rarity() - 9));
}
