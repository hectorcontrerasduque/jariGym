import pg from "pg";

const TABLES_IN_ORDER = [
  "profiles",
  "gym_config",
  "gym_config_payment_methods",
  "memberships",
  "payments",
  "payment_detail",
  "notification_config",
  "notification_log",
  "password_reset_tokens",
  "migracion",
  "api_rate_limits",
];

export type MigrationResult = {
  table: string;
  rows: number;
  ok: boolean;
  error?: string;
};

export async function migrateProdToDev(
  prodDatabaseUrl: string,
  devDatabaseUrl: string
): Promise<MigrationResult[]> {
  const source = new pg.Pool({
    connectionString: prodDatabaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  const target = new pg.Pool({
    connectionString: devDatabaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  const results: MigrationResult[] = [];

  try {
    for (const table of TABLES_IN_ORDER) {
      const srcClient = await source.connect();
      const dstClient = await target.connect();

      try {
        const { rows: sourceTables } = await srcClient.query(
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        );
        if (!sourceTables.some((r) => r.tablename === table)) {
          results.push({ table, rows: 0, ok: true });
          continue;
        }

        await dstClient.query(
          `ALTER TABLE IF EXISTS ${table} DISABLE ROW LEVEL SECURITY`
        );
        await dstClient.query(`TRUNCATE ${table} CASCADE`);

        const { rows: columns } = await srcClient.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position`,
          [table]
        );

        if (columns.length === 0) {
          results.push({ table, rows: 0, ok: true });
          continue;
        }

        const colNames = columns.map((c) => c.column_name).join(", ");

        const copyTo = (await import("pg-copy-streams")).to;
        const copyFrom = (await import("pg-copy-streams")).from;
        const { pipeline } = await import("node:stream/promises");

        const srcStream = srcClient.query(
          copyTo(`COPY ${table} (${colNames}) TO STDOUT`)
        );
        const dstStream = dstClient.query(
          copyFrom(`COPY ${table} (${colNames}) FROM STDIN`)
        );
        await pipeline(srcStream, dstStream);

        const { rows: countResult } = await dstClient.query(
          `SELECT COUNT(*) FROM ${table}`
        );
        const rowCount = parseInt(countResult[0].count as string);

        await dstClient.query(
          `ALTER TABLE IF EXISTS ${table} ENABLE ROW LEVEL SECURITY`
        );

        results.push({ table, rows: rowCount, ok: true });
      } catch (err) {
        await dstClient
          .query(`ALTER TABLE IF EXISTS ${table} ENABLE ROW LEVEL SECURITY`)
          .catch(() => {});
        results.push({
          table,
          rows: 0,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        srcClient.release();
        dstClient.release();
      }
    }

    await resetSequences(target);
  } finally {
    await source.end();
    await target.end();
  }

  return results;
}

async function resetSequences(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    const { rows: seqs } = await client.query(`
      SELECT
        pg_get_serial_sequence(c.table_name, c.column_name) AS seqname,
        c.table_name,
        c.column_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_default LIKE 'nextval%'
        AND pg_get_serial_sequence(c.table_name, c.column_name) IS NOT NULL
    `);

    for (const s of seqs) {
      await client.query(
        `SELECT setval($1, COALESCE((SELECT MAX(${s.column_name}) FROM ${s.table_name}), 1))`,
        [s.seqname]
      );
    }
  } finally {
    client.release();
  }
}

export async function testConnection(
  databaseUrl: string
): Promise<{ ok: boolean; error?: string; tables?: string[] }> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
      );
      return { ok: true, tables: rows.map((r) => r.tablename) };
    } finally {
      client.release();
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await pool.end();
  }
}
