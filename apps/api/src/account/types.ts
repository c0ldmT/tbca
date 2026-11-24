/** Persönliche Daten eines Accounts: Export (Auskunft) und Löschung (Abschnitt 4). */
export interface AccountDataRepository {
  /** Alle Daten, die TBCA zu einem Account speichert, als JSON-fähiges Objekt. */
  export(accountId: string): Promise<Record<string, unknown>>;
  /**
   * Löscht den Account samt Charakteren, Items, Sessions und Mitgliedschaften. In Replays anderer
   * Spieler wird der Name durch einen Platzhalter ersetzt; Ledger-Buchungen bleiben anonym erhalten.
   */
  delete(accountId: string, placeholderName: string): Promise<void>;
  setLocale(accountId: string, locale: 'de' | 'en' | null): Promise<void>;
}
