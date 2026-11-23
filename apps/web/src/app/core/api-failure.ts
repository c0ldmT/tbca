import { HttpErrorResponse } from '@angular/common/http';

/** Fehlercode der API (z. B. name_taken), für die Übersetzung unter errors.<code>. */
export class ApiFailure extends Error {
  constructor(
    readonly code: string,
    /** Zusätzliche Felder der Fehlerantwort, z. B. `problems` bei ungültiger Konfiguration. */
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

/** Wandelt einen HTTP-Fehler in den Code der API um, sonst http_<status> bzw. unknown. */
export function toFailure(error: unknown): ApiFailure {
  if (error instanceof ApiFailure) return error;
  if (error instanceof HttpErrorResponse) {
    const body = (error.error ?? {}) as Record<string, unknown>;
    const code = body['code'];
    return new ApiFailure(typeof code === 'string' ? code : `http_${error.status}`, body);
  }
  return new ApiFailure('unknown');
}
