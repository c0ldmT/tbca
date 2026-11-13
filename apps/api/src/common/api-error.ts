import { HttpException, HttpStatus } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Fehler mit maschinenlesbarem `code`, den die Website übersetzt.
 * Antwortformat: { statusCode, error, message, code }.
 */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    extra: Record<string, unknown> = {},
  ) {
    super(
      { statusCode: status, error: HttpStatus[status] ?? 'Error', message, code, ...extra },
      status,
    );
  }
}

/** Prüft einen Request-Body mit Zod; Fehler werden zu 400 mit code. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const first = result.error.issues[0];
  // Eigene Prüfungen (z. B. Namensregeln) liefern ihren Grund als message.
  const code =
    first?.code === 'custom'
      ? `invalid_${first.path.join('_')}_${first.message}`
      : 'invalid_request';
  throw new ApiError(HttpStatus.BAD_REQUEST, code, 'Ungültige Anfrage', {
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}
