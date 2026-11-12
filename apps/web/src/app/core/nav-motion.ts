/**
 * Seitenwechsel-Bewegung ohne View Transitions: Die App-Hülle setzt beim Seitenwechsel
 * data-nav (hub | tab) und data-nav-dir (next | prev) am Wurzelelement; motion.css lässt
 * damit die neuen Karten gestaffelt einschweben, einen Scan-Strahl über den Inhalt laufen
 * und den Hub-Titel glitchen. Alles läuft auf den echten Elementen – keine Schnappschüsse,
 * also kein Einfrieren des Canvas und kein Sprung am Ende.
 */

/** Hub-Wechsel oder Tab-Wechsel innerhalb desselben Hubs (erstes Pfadsegment gleich). */
export function transitionKind(from: string, to: string): 'hub' | 'tab' {
  const hub = (p: string) => p.split('/')[1] ?? '';
  return hub(from) === hub(to) && hub(from) !== '' ? 'tab' : 'hub';
}

/** Richtung eines Tab-Wechsels anhand der Reihenfolge der sichtbaren Tabs. */
export function tabDirection(
  tabs: readonly (string | null)[],
  from: string,
  to: string,
): 'next' | 'prev' {
  return tabs.indexOf(to) < tabs.indexOf(from) ? 'prev' : 'next';
}

/** Wie lange data-nav stehen bleibt: deckt auch Karten ab, die erst nach dem Laden erscheinen. */
export const NAV_MOTION_MS = 2400;

/**
 * Startet die Bewegung neu: Attribut entfernen, Layout erzwingen, wieder setzen – so beginnen
 * die CSS-Animationen auch bei schnellen Wechseln von vorn. Gibt eine Aufräumfunktion zurück.
 */
export function playNavMotion(
  root: HTMLElement,
  kind: 'hub' | 'tab',
  dir: 'next' | 'prev',
  timers: Pick<Window, 'setTimeout' | 'clearTimeout'>,
  previous: number | undefined,
): number {
  if (previous !== undefined) timers.clearTimeout(previous);
  delete root.dataset['nav'];
  void root.offsetWidth;
  root.dataset['nav'] = kind;
  root.dataset['navDir'] = dir;
  return timers.setTimeout(() => {
    delete root.dataset['nav'];
    delete root.dataset['navDir'];
  }, NAV_MOTION_MS);
}
