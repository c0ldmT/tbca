import { DOCUMENT } from '@angular/common';
import {
  Directive,
  ElementRef,
  afterNextRender,
  inject,
  input,
  type OnDestroy,
} from '@angular/core';

/**
 * Gleitende Markierung (Hub-Pille, Tab-Linie): misst das aktive Kind-Element und schreibt
 * Position und Größe als CSS-Variablen (--ind-x/-y/-w/-h, --ind-o) an den Container. Die
 * Markierung selbst ist ein normales Element im Container und gleitet per CSS-Transition.
 * Läuft auf dem echten DOM – keine Schnappschüsse wie bei View Transitions.
 *
 * Reagiert auf Klassenwechsel (routerLinkActive) und Größenänderungen; bei Größenänderungen
 * springt die Markierung ohne Animation (data-ind-still).
 */
@Directive({ selector: '[tbcaSlideIndicator]' })
export class SlideIndicator implements OnDestroy {
  /** CSS-Klasse des aktiven Elements, z. B. hub--on. */
  readonly tbcaSlideIndicator = input.required<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly window = inject(DOCUMENT).defaultView;
  private mutations: MutationObserver | null = null;
  private resizes: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      this.update(false);
      if (typeof MutationObserver !== 'undefined') {
        this.mutations = new MutationObserver(() => this.update(true));
        this.mutations.observe(this.host, { subtree: true, attributeFilter: ['class'] });
      }
      if (typeof ResizeObserver !== 'undefined') {
        this.resizes = new ResizeObserver(() => this.update(false));
        this.resizes.observe(this.host);
      }
    });
  }

  ngOnDestroy(): void {
    this.mutations?.disconnect();
    this.resizes?.disconnect();
  }

  private update(animate: boolean): void {
    const active = this.host.querySelector<HTMLElement>('.' + this.tbcaSlideIndicator());
    const style = this.host.style;
    if (!active) {
      style.setProperty('--ind-o', '0');
      return;
    }
    if (!animate) this.host.dataset['indStill'] = '';
    style.setProperty('--ind-x', `${active.offsetLeft}px`);
    style.setProperty('--ind-y', `${active.offsetTop}px`);
    style.setProperty('--ind-w', `${active.offsetWidth}px`);
    style.setProperty('--ind-h', `${active.offsetHeight}px`);
    style.setProperty('--ind-o', '1');
    if (!animate) {
      // Erst im nächsten Bild wieder animieren, damit der Sprung nicht gleitet
      this.window?.requestAnimationFrame(() => delete this.host.dataset['indStill']);
    }
  }
}
