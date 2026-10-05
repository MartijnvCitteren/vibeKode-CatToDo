// Deletes the local SQLite database file; `npm run db:reset` then migrates a fresh one.
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @next/env is CommonJS, so Node only offers its default export to ES modules.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url?.startsWith("file:")) {
  throw new Error(`db:reset only deletes local file: databases, got ${url}`);
}

const file = url.startsWith("file://")
  ? fileURLToPath(url)
  : resolve(url.slice("file:".length));

// SQLite keeps journal files next to the database; a leftover one would corrupt the fresh file.
for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  await rm(file + suffix, { force: true });
}
console.log(`Deleted ${file}`);
