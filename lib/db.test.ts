import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, expect, test } from "vitest";

let dir: string;
let db: typeof import("./db").db;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "todo-cat-db-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  // Imported after DATABASE_URL is set, because lib/db.ts reads it on load.
  ({ db } = await import("./db"));
  await migrate(db, { migrationsFolder: "drizzle" });
});

afterAll(async () => {
  db?.$client.close();
  await rm(dir, { recursive: true, force: true });
});

test("migrates a fresh database and answers queries", async () => {
  expect(await db.get(sql`select 1 as ok`)).toEqual({ ok: 1 });
  expect(
    await db.get(
      sql`select name from sqlite_master where name = '__drizzle_migrations'`,
    ),
  ).toEqual({ name: "__drizzle_migrations" });
});
