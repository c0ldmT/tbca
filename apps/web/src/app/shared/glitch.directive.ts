import { DOCUMENT } from '@angular/common';
import {
  Directive,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  type OnDestroy,
} from '@angular/core';
import { motion } from '@tbca/assets';

/**
 * Glitch-Effekt (RGB-Split, Slice-Verschiebung) als dosiertes Akzentmittel.
 *
 * Läuft einmal beim Erscheinen und jedes Mal, wenn sich `tbcaGlitch` ändert, z. B. bei einem
 * neuen Kampfergebnis. Dauer höchstens 300 ms; bei `prefers-reduced-motion` gar nicht.
 *
 *   <h1 tbcaGlitch>TBCA</h1>
 *   <p [tbcaGlitch]="result().logHash">…</p>
 */
@Directive({
  selector: '[tbcaGlitch]',
  host: { class: 'tbca-glitch' },
})
export class GlitchDirective implements OnDestroy {
  /** Jeder neue Wert löst den Effekt erneut aus. */
  readonly tbcaGlitch = input<unknown>();

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly window = inject(DOCUMENT).defaultView;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private rendered = false;

  constructor() {
    afterNextRender(() => {
      this.rendered = true;
      this.play();
    });
    effect(() => {
      this.tbcaGlitch();
      if (this.rendered) this.play();
    });
  }

  /** Spielt den Effekt einmal ab. */
  play(): void {
    if (this.prefersReducedMotion()) return;
    this.element.setAttribute('data-glitch-text', this.element.textContent?.trim() ?? '');
    this.element.classList.remove('tbca-glitch--active');
    // Reflow erzwingen, damit die Animation neu startet.
    void this.element.offsetWidth;
    this.element.classList.add('tbca-glitch--active');
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.element.classList.remove('tbca-glitch--active'),
      motion.glitchMs,
    );
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  private prefersReducedMotion(): boolean {
    return this.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }
}
