// Local development PostgreSQL, powered by `embedded-postgres` (real Postgres
// binaries, no Docker required). Used for applying migrations and running the
// database-backed research workflow locally and in the verification script.
//
// Run directly to start a persistent local database that stays up until you
// stop it (Ctrl+C):
//
//     npm run db:local
//
// It reads connection settings from DATABASE_URL (falling back to the standard
// local dev URL), so `prisma migrate`, `prisma db seed`, and `npm run dev` all
// connect to it with no extra configuration.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_URL = "postgresql://postgres:postgres@localhost:5432/outreach?schema=public";

export function parsePgEnv() {
  const u = new URL(process.env.DATABASE_URL || DEFAULT_URL);
  return {
    host: u.hostname,
    port: Number(u.port || "5432"),
    user: decodeURIComponent(u.username || "postgres"),
    password: decodeURIComponent(u.password || "postgres"),
    database: (u.pathname || "/outreach").slice(1) || "outreach",
  };
}

/**
 * `fresh: true` DELETES the entire data directory before starting. It is not a
 * "reset the schema" flag: every org, lead, draft and approval in that
 * directory is gone, with no prompt and no backup. Callers must pass an
 * explicit `dataDir` they own; defaulting to the developer's working database
 * has already cost one.
 *
 * @param {{ dataDir?: string, fresh?: boolean }} [options]
 */
export async function startLocalPostgres({ dataDir, fresh = false } = {}) {
  const cfg = parsePgEnv();
  const dir = dataDir || process.env.EMBEDDED_PG_DIR || "./.local-postgres";
  const normalizedDir = dir.replace(/\\/g, "/").replace(/\/+$/, "");
  if (fresh && /(^|\/)\.local-postgres$/.test(normalizedDir)) {
    throw new Error(
      `Refusing to wipe the default development database at ${dir}. ` +
        "fresh:true deletes the entire data directory, not just the schema. " +
        "Pass a dataDir of your own.",
    );
  }
  if (fresh) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: cfg.user,
    password: cfg.password,
    port: cfg.port,
    persistent: true,
  });
  if (!existsSync(`${dir}/PG_VERSION`)) {
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase(cfg.database);
  } catch {
    // Database already exists.
  }
  return { pg, cfg, dir };
}

// When executed directly (not imported), run as a foreground daemon.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void (async () => {
    const { pg, cfg } = await startLocalPostgres();
    console.log(
      `Local PostgreSQL ready on port ${cfg.port} (database "${cfg.database}"). Press Ctrl+C to stop.`,
    );
    const shutdown = async () => {
      try {
        await pg.stop();
      } finally {
        process.exit(0);
      }
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    // Keep the process alive.
    await new Promise(() => {});
  })();
}
