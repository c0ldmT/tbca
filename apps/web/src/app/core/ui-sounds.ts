import type { SoundId } from './sound.service';

/**
 * Welcher leise UI-Klang zu einem Klick gehört. Interne Links bekommen keinen Klang, weil
 * der Seitenwechsel seinen eigenen spielt; deaktivierte Elemente und Auswahllisten bleiben
 * stumm. Elemente mit data-sfx="off" schalten den Klang ab, data-sfx="<id>" wählt einen anderen.
 */
export function soundForClick(target: EventTarget | null): SoundId | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(
    'button, a[href], [role="tab"], [role="radio"], [role="checkbox"], label, summary',
  );
  if (!el) return null;
  const custom = el.closest('[data-sfx]')?.getAttribute('data-sfx');
  if (custom === 'off') return null;
  if (custom) return custom as SoundId;
  if (el.matches(':disabled, [aria-disabled="true"]')) return null;
  if (el instanceof HTMLAnchorElement) {
    const href = el.getAttribute('href') ?? '';
    return href.startsWith('/') && !el.hasAttribute('download') ? null : 'press';
  }
  if (el.matches('[aria-pressed], [role="tab"], [role="checkbox"]')) return 'toggle';
  if (el.matches('[role="radio"]')) return 'select';
  if (el instanceof HTMLLabelElement) {
    const input = el.querySelector('input');
    if (!input || input.disabled) return null;
    return input.type === 'radio' ? 'select' : 'toggle';
  }
  return 'press';
}

/** Pfad ohne Query und Fragment. */
export function pathOnly(url: string): string {
  return url.split(/[?#]/)[0] || '/';
}
