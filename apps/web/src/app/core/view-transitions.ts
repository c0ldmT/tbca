import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';
import type { ActivatedRouteSnapshot, ViewTransitionInfo } from '@angular/router';

import { PreferencesService } from './preferences.service';

/** Voller Pfad der tiefsten aktiven Route, z. B. /character/gear. */
export function leafPath(snapshot: ActivatedRouteSnapshot): string {
  let node = snapshot;
  while (node.firstChild) node = node.firstChild;
  return '/' + node.pathFromRoot.flatMap((r) => r.url.map((u) => u.path)).join('/');
}

/** Hub-Wechsel oder Tab-Wechsel innerhalb desselben Hubs (erstes Pfadsegment gleich). */
export function transitionKind(from: string, to: string): 'hub' | 'tab' {
  const hub = (p: string) => p.split('/')[1] ?? '';
  return hub(from) === hub(to) && hub(from) !== '' ? 'tab' : 'hub';
}

/**
 * Wird für jeden Seitenwechsel mit View Transition gerufen (läuft im Injection-Kontext).
 * Überspringt reine Query-Änderungen und die niedrige Grafikstufe, setzt Art und Richtung
 * des Übergangs als data-Attribute für transitions.css. Den Klang spielt die App-Hülle, damit
 * er auch ohne View-Transition-Unterstützung erklingt.
 */
export function onViewTransitionCreated({ transition, from, to }: ViewTransitionInfo): void {
  const root = inject(DOCUMENT).documentElement;
  const prefs = inject(PreferencesService);
  const a = leafPath(from);
  const b = leafPath(to);
  if (a === b || prefs.effectiveQuality() === 'niedrig') {
    transition.skipTransition();
    return;
  }
  const kind = transitionKind(a, b);
  root.dataset['vt'] = kind;
  // Richtung aus der Reihenfolge der Tabs, die gerade zu sehen sind
  const tabs = Array.from(root.querySelectorAll('a.tbca-tab'), (el) => el.getAttribute('href'));
  root.dataset['vtDir'] = tabs.indexOf(b) < tabs.indexOf(a) ? 'prev' : 'next';
  // Erst nach dem DOM-Wechsel: so trägt nur der neue Hub-Kopf einen Namen
  if (kind === 'hub') {
    void transition.updateCallbackDone
      .then(() => (root.dataset['vtIn'] = 'hub'))
      .catch(() => undefined);
  }
  void transition.finished.finally(() => {
    delete root.dataset['vt'];
    delete root.dataset['vtDir'];
    delete root.dataset['vtIn'];
  });
}
