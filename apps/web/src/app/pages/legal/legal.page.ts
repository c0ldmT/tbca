import { Component, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { LegalService } from '../../core/legal.service';

/** Abschnitte der Datenschutzerklärung (Übersetzungen unter legal.privacy.sN). */
const PRIVACY_SECTIONS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const;

/**
 * Impressum und Datenschutzerklärung. Betreiberangaben und Modus (öffentlich oder privat) stehen in
 * public/legal.json, damit jede Instanz sie ohne Code-Änderung pflegen kann. Die
 * Datenschutzerklärung beschreibt, was TBCA tatsächlich speichert.
 */
@Component({
  selector: 'tbca-legal-page',
  imports: [TranslocoDirective],
  template: `
    <article class="tbca-panel doc" *transloco="let t">
      <span class="tbca-kicker">{{ t('legal.kicker') }}</span>
      <h1 class="tbca-title">{{ t('legal.' + section() + '.title') }}</h1>
      @if (legal.missing()) {
        <p class="warning" role="note">{{ t('legal.missing') }}</p>
      }
      @if (section() === 'imprint') {
        <h2>{{ t('legal.imprint.provider') }}</h2>
        <address>
          @if (legal.operator(); as o) {
            {{ o.name }}<br />{{ o.street }}<br />{{ o.city }}<br />
            <a [href]="'mailto:' + o.email">{{ o.email }}</a>
          }
        </address>
        <p>{{ t('legal.imprint.body') }}</p>
      } @else {
        @if (legal.isPrivate()) {
          <p>{{ t('legal.privacy.private') }}</p>
        }
        @if (legal.operator(); as o) {
          @if (o.name && o.email) {
            <p>{{ t('legal.privacy.controller', { name: o.name, email: o.email }) }}</p>
          }
        }
        @for (s of sections; track s) {
          <h2>{{ t('legal.privacy.' + s + '.title') }}</h2>
          <p>{{ t('legal.privacy.' + s + '.body') }}</p>
        }
      }
    </article>
  `,
  styles: `
    :host {
      display: block;
      width: min(100%, 48rem);
      margin-inline: auto;
      padding: 32px clamp(16px, 3vw, 40px) 56px;
    }
    .doc {
      display: block;
      padding: clamp(20px, 4vw, 40px);
    }
    .tbca-title {
      font-size: clamp(1.75rem, 4vw, 2.5rem);
      margin: 6px 0 var(--tbca-space-6);
    }
    h2 {
      font: 600 0.875rem / 1.2 var(--tbca-font-display);
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--tbca-neon-cyan);
      margin: var(--tbca-space-8) 0 var(--tbca-space-2);
    }
    p,
    address {
      color: var(--tbca-text-muted);
      font-style: normal;
      line-height: 1.6;
    }
    p {
      color: var(--tbca-text-secondary);
    }
    .warning {
      border-left: 2px solid var(--tbca-neon-magenta);
      padding: var(--tbca-space-2) var(--tbca-space-4);
      background: linear-gradient(90deg, rgb(255 42 109 / 0.12), transparent);
      color: var(--tbca-text-primary);
    }
  `,
})
export class LegalPage {
  protected readonly legal = inject(LegalService);
  private readonly router = inject(Router);

  /** Aus den Routendaten: imprint oder privacy. */
  readonly section = input.required<'imprint' | 'privacy'>();

  protected readonly sections = PRIVACY_SECTIONS;

  constructor() {
    void this.legal.load();
    // Private Instanzen haben kein Impressum: direkt zur Datenschutzerklärung.
    effect(() => {
      if (this.legal.isPrivate() && this.section() === 'imprint')
        void this.router.navigateByUrl('/datenschutz');
    });
  }
}
