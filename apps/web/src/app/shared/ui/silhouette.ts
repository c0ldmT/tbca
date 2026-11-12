import { Component, computed, input } from '@angular/core';
import { SILHOUETTE_VIEWBOX, silhouetteFor } from '@tbca/assets';

let nextId = 0;

/**
 * Hologramm-Silhouette einer Klasse: Körperflächen mit Verlauf und Zeilenraster, Akzentlinien
 * in Klassenfarbe. `tint` färbt die Kontur (z. B. Magenta für Gegner im HUD).
 */
@Component({
  selector: 'tbca-silhouette',
  template: `
    <svg [attr.viewBox]="viewBox" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient [attr.id]="gid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" [attr.stop-color]="tint()" stop-opacity="0.24" />
          <stop offset="1" [attr.stop-color]="tint()" stop-opacity="0.03" />
        </linearGradient>
        <pattern [attr.id]="pid" width="6" height="5" patternUnits="userSpaceOnUse">
          <path d="M0 0.5 H6" [attr.stroke]="tint()" stroke-opacity="0.16" />
        </pattern>
      </defs>
      @for (d of shape().body; track $index) {
        <path
          [attr.d]="d"
          [attr.fill]="'url(#' + gid + ')'"
          [attr.stroke]="tint()"
          stroke-opacity="0.78"
          stroke-width="1.2"
          stroke-linejoin="round"
        />
      }
      @if (wire()) {
        @for (d of shape().body; track $index) {
          <path [attr.d]="d" [attr.fill]="'url(#' + pid + ')'" />
        }
      }
      @for (d of shape().accents; track $index) {
        <path
          class="acc"
          [attr.d]="d"
          fill="none"
          [attr.stroke]="accent()"
          [style.color]="accent()"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .acc {
      filter: drop-shadow(0 0 3px currentColor);
    }
  `,
})
export class SilhouetteFigure {
  readonly classId = input<string | null>(null);
  readonly tint = input('#00F0FF');
  /** Akzentfarbe; Standard ist die Klassenfarbe. */
  readonly accentColor = input<string | null>(null);
  readonly wire = input(true);

  protected readonly viewBox = SILHOUETTE_VIEWBOX;
  protected readonly gid = `sil-g-${++nextId}`;
  protected readonly pid = `sil-p-${nextId}`;
  protected readonly shape = computed(() => silhouetteFor(this.classId()));
  protected readonly accent = computed(() => this.accentColor() ?? this.shape().accent);
}
