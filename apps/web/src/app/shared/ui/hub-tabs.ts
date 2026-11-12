import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

export interface HubTab {
  /** Absoluter Pfad, z. B. /character/gear. */
  path: string;
  /** Übersetzungsschlüssel der Beschriftung. */
  label: string;
  /** Optionales Symbol als SVG-Pfad (24×24). */
  icon?: string;
  /** Kleines Abzeichen rechts, z. B. „LIVE“. */
  badge?: string | null;
}

/** Tabs unter einem Hub-Titel; jeder Tab ist eine eigene Route. */
@Component({
  selector: 'tbca-hub-tabs',
  imports: [RouterLink, RouterLinkActive, TranslocoDirective],
  template: `
    <nav class="tbca-tabs" *transloco="let t" [attr.aria-label]="label()">
      @for (tab of tabs(); track tab.path) {
        <a
          class="tbca-tab"
          [routerLink]="tab.path"
          routerLinkActive="tbca-tab--on"
          ariaCurrentWhenActive="page"
          queryParamsHandling=""
        >
          @if (tab.icon) {
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path [attr.d]="tab.icon" />
            </svg>
          }
          {{ t(tab.label) }}
          @if (tab.badge) {
            <span class="tbca-badge">{{ tab.badge }}</span>
          }
        </a>
      }
    </nav>
  `,
  styles: `
    :host {
      display: block;
    }
    @media (max-width: 760px) {
      .tbca-tabs {
        flex-wrap: nowrap;
        overflow-x: auto;
      }
      .tbca-tab {
        white-space: nowrap;
        padding: 0 14px;
      }
    }
  `,
})
export class HubTabs {
  readonly tabs = input.required<readonly HubTab[]>();
  readonly label = input('');
}
