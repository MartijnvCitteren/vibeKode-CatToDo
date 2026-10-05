# Database

## Approach

- SQLite through Drizzle ORM and `@libsql/client`; `DATABASE_URL` (default `file:./data/app.db`) picks the file.
- `lib/db.ts` is the only module that opens the database and exports the Drizzle instance; everything else imports `db` from it.
- `lib/db.ts` imports `server-only`, so any Client Component that reaches it fails the build instead of shipping database code to the browser.
- Tables live in `lib/schema.ts`, which is empty on purpose: todos arrive with the architecture, auth tables with authentication.
- Migrations are generated SQL files under `drizzle/`, applied by `drizzle-kit migrate`; the schema is never pushed straight to a database.

## Decisions

- Drizzle is the v1 release candidate (`@rc` dist-tag, pinned exactly); npm's `latest` is still 0.x, whose APIs and migration format differ from the current docs.
- `drizzle.config.ts` uses `dialect: "turso"`, Drizzle Kit's libsql dialect, so Kit connects with the same `@libsql/client` the app uses; `"sqlite"` would pick whichever SQLite driver happens to be installed.
- `drizzle.config.ts` and `scripts/db-reset.mts` load env files with `@next/env`, so they follow the exact precedence Next.js uses (`.env.local` over `.env`, and a variable already in the environment wins).
- `.env` is gitignored and `.env.example` holds the defaults, because auth secrets will join `DATABASE_URL` later.
- `@libsql/client` is on Next.js's built-in `serverExternalPackages` list, so `next.config.ts` needs no entry for its native binding.

## Test databases

- Vitest: `lib/db.test.ts` points `DATABASE_URL` at a temp file, then imports `lib/db.ts` and migrates it with Drizzle's runtime migrator from `drizzle/`.
- Playwright: the web server gets `E2E_DATABASE_URL` (by default a file in a temp dir that `e2e/global-teardown.ts` deletes) and runs `drizzle-kit migrate` against it before `next dev`.

## Gotchas

- `lib/db.ts` reads `DATABASE_URL` on import, so a test must set it before a dynamic `import()` of the module, not in a static import.
- `server-only` throws outside a React Server bundle, so the Vitest node project mocks it in `vitest.setup.node.ts`.
- Drizzle v1 writes one folder per migration (`migration.sql` plus `snapshot.json`) and no journal.
- The runtime migrator throws when `drizzle/` is missing, so `drizzle/.gitkeep` keeps the folder in git until the first migration lands; with no migrations, migrating only creates `__drizzle_migrations`.
- `@next/env` is CommonJS, so Node ES module scripts must use its default export (`nextEnv.loadEnvConfig`) rather than a named import.
- `db:reset` refuses any URL that is not `file:`, and also deletes SQLite's `-journal`, `-wal` and `-shm` side files so the fresh database starts clean.
