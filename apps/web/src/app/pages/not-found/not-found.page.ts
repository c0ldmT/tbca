import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { GlitchDirective } from '../../shared/glitch.directive';

@Component({
  selector: 'tbca-not-found-page',
  imports: [TranslocoDirective, RouterLink, GlitchDirective],
  template: `
    <ng-container *transloco="let t; prefix: 'notFound'">
      <h1 tbcaGlitch>404</h1>
      <h2>{{ t('title') }}</h2>
      <p>{{ t('body') }}</p>
      <a class="tbca-button" routerLink="/">{{ t('back') }}</a>
    </ng-container>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--tbca-space-4);
      justify-items: start;
      width: min(100%, 44rem);
      margin-inline: auto;
      padding: var(--tbca-space-12) var(--tbca-space-4);
    }
    h1 {
      font-size: var(--tbca-text-display);
      color: var(--tbca-neon-magenta);
    }
    p {
      color: var(--tbca-text-muted);
    }
  `,
})
export class NotFoundPage {}
