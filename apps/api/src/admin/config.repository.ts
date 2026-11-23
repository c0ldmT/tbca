import { configVersion, type Database, type SeasonConfigData } from '@tbca/db';
import { and, desc, eq } from 'drizzle-orm';

export interface ConfigVersionInfo {
  version: number;
  status: 'draft' | 'published' | 'archived';
  notes: string | null;
  createdAt: Date;
  publishedAt: Date | null;
}

export interface ConfigRepository {
  list(seasonId: string): Promise<ConfigVersionInfo[]>;
  get(
    seasonId: string,
    version: number,
  ): Promise<(ConfigVersionInfo & { data: SeasonConfigData }) | null>;
  createDraft(
    seasonId: string,
    data: SeasonConfigData,
    notes: string | null,
    schemaVersion: number,
    actor: string,
  ): Promise<number>;
  updateDraft(
    seasonId: string,
    version: number,
    data: SeasonConfigData,
    notes: string | null,
  ): Promise<void>;
  /** Veröffentlicht einen Entwurf; die bisherige Version wird archiviert. */
  publish(seasonId: string, version: number): Promise<void>;
}

export class DrizzleConfigRepository implements ConfigRepository {
  constructor(private readonly db: Database) {}

  async list(seasonId: string): Promise<ConfigVersionInfo[]> {
    return this.db
      .select({
        version: configVersion.version,
        status: configVersion.status,
        notes: configVersion.notes,
        createdAt: configVersion.createdAt,
        publishedAt: configVersion.publishedAt,
      })
      .from(configVersion)
      .where(eq(configVersion.seasonId, seasonId))
      .orderBy(desc(configVersion.version));
  }

  async get(seasonId: string, version: number) {
    const [row] = await this.db
      .select()
      .from(configVersion)
      .where(and(eq(configVersion.seasonId, seasonId), eq(configVersion.version, version)));
    return row ?? null;
  }

  async createDraft(
    seasonId: string,
    data: SeasonConfigData,
    notes: string | null,
    schemaVersion: number,
    actor: string,
  ) {
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ version: configVersion.version })
        .from(configVersion)
        .where(eq(configVersion.seasonId, seasonId))
        .orderBy(desc(configVersion.version))
        .limit(1)
        .for('update');
      const version = (last?.version ?? 0) + 1;
      await tx.insert(configVersion).values({
        seasonId,
        version,
        schemaVersion,
        status: 'draft',
        data,
        notes,
        createdByAccountId: actor,
      });
      return version;
    });
  }

  async updateDraft(
    seasonId: string,
    version: number,
    data: SeasonConfigData,
    notes: string | null,
  ) {
    await this.db
      .update(configVersion)
      .set({ data, notes })
      .where(
        and(
          eq(configVersion.seasonId, seasonId),
          eq(configVersion.version, version),
          eq(configVersion.status, 'draft'),
        ),
      );
  }

  async publish(seasonId: string, version: number) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(configVersion)
        .set({ status: 'archived' })
        .where(and(eq(configVersion.seasonId, seasonId), eq(configVersion.status, 'published')));
      await tx
        .update(configVersion)
        .set({ status: 'published', publishedAt: new Date() })
        .where(and(eq(configVersion.seasonId, seasonId), eq(configVersion.version, version)));
    });
  }
}
