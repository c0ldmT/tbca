import { and, eq } from 'drizzle-orm';

import { createDb } from '../client.js';
import { account, identity } from '../schema.js';
import { requireDatabaseUrl } from './env.js';

/**
 * Macht einen Account zum Superadmin (oder nimmt die Rolle wieder). Aufruf über
 * scripts/admin.sh mit der Discord-ID des Accounts.
 */
const [discordId, mode = 'grant'] = process.argv.slice(2);
if (!discordId || !/^\d{5,25}$/.test(discordId)) {
  throw new Error(
    'Discord-ID fehlt (Entwicklermodus in Discord → Rechtsklick auf dich → ID kopieren).',
  );
}
const { db, close } = createDb(requireDatabaseUrl(), {
  maxConnections: 1,
  applicationName: 'tbca-admin',
});
try {
  const [row] = await db
    .select({ accountId: identity.accountId, name: identity.displayName })
    .from(identity)
    .where(and(eq(identity.provider, 'discord'), eq(identity.providerUserId, discordId)));
  if (!row)
    throw new Error('Kein Account mit dieser Discord-ID. Zuerst einmal auf der Website anmelden.');
  await db
    .update(account)
    .set({ globalRole: mode === 'revoke' ? 'player' : 'superadmin' })
    .where(eq(account.id, row.accountId));
  console.info(`${row.name} ist jetzt ${mode === 'revoke' ? 'Spieler' : 'Superadmin'}.`);
} finally {
  await close();
}
