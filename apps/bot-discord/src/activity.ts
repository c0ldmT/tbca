import { createHash } from 'node:crypto';

/**
 * Aus einer Nachricht wird nur die Länge und ein kurzlebiger Hash für die Wiederholungsprüfung
 * (Spezifikation, Abschnitt 11). Der Inhalt verlässt den Bot nie und wird nirgends gespeichert.
 * Die Normalisierung lässt nahezu gleiche Nachrichten („gg“, „GG!!“, „g g“) gleich aussehen.
 */
export function fingerprint(content: string): { length: number; hash: string } {
  const normalized = content
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/<a?:\w+:\d+>/g, '') // Custom-Emojis
    .replace(/https?:\/\/\S+/g, 'url')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return {
    length: normalized.length,
    hash: createHash('sha256').update(normalized).digest('hex').slice(0, 16),
  };
}
