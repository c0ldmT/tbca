const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a (32 Bit) über die UTF-16-Codeeinheiten eines Strings.
 * Nicht kryptografisch; dient als stabiler Fingerabdruck (Seeds, Event-Logs).
 */
export function fnv1a32(input: string, seed: number = FNV_OFFSET): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

/** Fingerabdruck als 8-stelliger Hex-String. */
export function hashHex(input: string): string {
  return fnv1a32(input).toString(16).padStart(8, '0');
}
