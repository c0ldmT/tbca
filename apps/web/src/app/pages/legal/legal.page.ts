import { Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * Impressum und Datenschutzerklärung (DE/EN). Die verbindlichen Inhalte liefert der
 * Betreiber der Instanz; bis dahin steht hier ein Platzhalter.
 */
@Component({
  selector: 'tbca-legal-page',
  imports: [TranslocoDirective],
  template: `
    <article *transloco="let t; prefix: 'legal.' + section()">
      <h1>{{ t('title') }}</h1>
      <p>{{ t('body') }}</p>
    </article>
  `,
  styles: `
    :host {
      display: block;
      width: min(100%, 44rem);
      margin-inline: auto;
      padding: var(--tbca-space-12) var(--tbca-space-4);
    }
    h1 {
      font-size: var(--tbca-text-2xl);
      margin-bottom: var(--tbca-space-6);
    }
    p {
      color: var(--tbca-text-muted);
    }
  `,
})
export class LegalPage {
  /** Aus den Routendaten: imprint oder privacy. */
  readonly section = input.required<'imprint' | 'privacy'>();
}
