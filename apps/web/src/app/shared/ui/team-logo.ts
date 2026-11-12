import { Component, computed, input } from '@angular/core';
import { ICON_VIEWBOX, TEAM_EMBLEMS, circuitTrace, teamColors } from '@tbca/assets';

let nextId = 0;

/**
 * Prozedurales Team-Logo: Sechseck-Schild mit Verlauf in den Teamfarben (aus dem Kürzel),
 * Emblem der Logo-Wahl und Leiterbahnen, die jedes Team unterscheidbar machen.
 */
@Component({
  selector: 'tbca-team-logo',
  template: `
    <svg [attr.viewBox]="viewBox" [attr.width]="size()" [attr.height]="size()" aria-hidden="true">
      <defs>
        <linearGradient [attr.id]="gid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" [attr.stop-color]="colors()[0]" />
          <stop offset="1" [attr.stop-color]="colors()[1]" />
        </linearGradient>
      </defs>
      <path
        d="M24 1.5 L44 13 V35 L24 46.5 L4 35 V13 Z"
        fill="#0b0d1a"
        [attr.stroke]="'url(#' + gid + ')'"
        stroke-width="2"
      />
      <path
        d="M24 6 L40 15.5 V32.5 L24 42 L8 32.5 V15.5 Z"
        [attr.fill]="'url(#' + gid + ')'"
        fill-opacity="0.14"
      />
      <path
        [attr.d]="trace()"
        fill="none"
        [attr.stroke]="colors()[1]"
        stroke-opacity="0.4"
        stroke-width="0.8"
      />
      <g transform="translate(9.6 9.6) scale(0.6)">
        <path
          [attr.d]="emblem()"
          fill="none"
          [attr.stroke]="colors()[0]"
          stroke-width="3"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </g>
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      filter: drop-shadow(0 0 8px rgb(0 240 255 / 0.25));
    }
  `,
})
export class TeamLogo {
  readonly logo = input.required<string>();
  readonly tag = input('');
  readonly size = input(48);

  protected readonly viewBox = ICON_VIEWBOX;
  protected readonly gid = `team-g-${++nextId}`;
  protected readonly colors = computed(() => teamColors(this.tag() || this.logo()));
  protected readonly emblem = computed(() => TEAM_EMBLEMS[this.logo()] ?? TEAM_EMBLEMS['chip']!);
  protected readonly trace = computed(() => circuitTrace(`team:${this.tag()}`));
}
