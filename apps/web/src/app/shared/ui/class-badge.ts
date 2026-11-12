import { Component, computed, input } from '@angular/core';

const GRADIENTS: Record<string, string> = {
  bruiser: 'linear-gradient(135deg, #ff2a6d, #ffb000)',
  gunner: 'linear-gradient(135deg, #f5e400, #ffb000)',
  netrunner: 'linear-gradient(135deg, #00f0ff, #b44cff)',
  medtech: 'linear-gradient(135deg, #3dffa8, #00f0ff)',
};
const CODES: Record<string, string> = {
  bruiser: 'BR',
  gunner: 'GU',
  netrunner: 'NR',
  medtech: 'MT',
};

/** Sechseck mit Klassenkürzel und Klassenverlauf, z. B. in Gegnerlisten und im HUD. */
@Component({
  selector: 'tbca-class-badge',
  template: `<span
    class="hex"
    [style.background]="bg()"
    [style.width.px]="size()"
    [style.height.px]="size()"
    >{{ code() }}</span
  >`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
    .hex {
      display: grid;
      place-items: center;
      clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
      font: 700 0.8125rem / 1 var(--tbca-font-display);
      color: var(--tbca-bg-void);
    }
  `,
  host: { 'aria-hidden': 'true' },
})
export class ClassBadge {
  readonly classId = input<string | null>(null);
  readonly size = input(52);

  protected readonly bg = computed(
    () => GRADIENTS[this.classId() ?? ''] ?? 'linear-gradient(135deg, #ff2a6d, #b44cff)',
  );
  protected readonly code = computed(() => CODES[this.classId() ?? ''] ?? '??');
}
