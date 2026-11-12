/** Bietet Daten als Datei zum Speichern an (ohne Server-Umweg). */
export function downloadText(filename: string, text: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Nach dem Klick freigeben; der Browser hat den Download dann übernommen
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function downloadJson(filename: string, data: unknown): void {
  downloadText(filename, `${JSON.stringify(data, null, 2)}\n`, 'application/json');
}

/** CSV mit Semikolon (öffnet in deutschsprachigen Tabellenprogrammen direkt richtig). */
export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${rows.map((r) => r.map(cell).join(';')).join('\n')}\n`;
}

/** Liest eine vom Nutzer gewählte Datei als Text. */
export function readFile(file: File): Promise<string> {
  return file.text();
}
