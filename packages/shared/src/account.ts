import { z } from 'zod';

/** PUT /api/account/settings */
export const accountSettingsSchema = z.object({ locale: z.enum(['de', 'en']).nullable() });
/** POST /api/account/delete – Bestätigung durch Eintippen von „LÖSCHEN“. */
export const accountDeleteSchema = z.object({ confirmation: z.string().max(20) });
