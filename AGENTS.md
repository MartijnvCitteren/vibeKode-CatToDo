<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# todo-cat

A to-do list web app kept by Lissie, a cat with attitude (an AI agent, coming later).
Next.js 16 App Router at the repo root, plus npm workspaces `contract/` (shared zod schemas) and `cli/` (the `todo-cat` CLI, a REST client).
Persistence is SQLite through Drizzle ORM and `@libsql/client`; authentication is Better Auth with email and password.

## Commands

Run from the repo root.

- Node `^24.15.0 || >=26` is required (`engines` in `package.json`), because jsdom 30 needs it.
- `npm install` installs the root app and both workspaces.
- `cp .env.example .env` creates the local env file (gitignored); fill `BETTER_AUTH_SECRET` with `openssl rand -base64 32`.
- `npm run dev` starts the dev server on http://localhost:3000.
- `npm run build` builds the app for production.
- `npx todo-cat --help` runs the CLI against `TODO_CAT_URL` (default http://localhost:3000); `npm run build -w todo-cat-cli` rebuilds it.
- `npm run qa` runs every check (Biome, typecheck, build, CLI build, Vitest, Playwright) and prints only what failed; see [testing.md](tech-docs/testing.md).
- `npm run lint` runs `biome check` (lint, format and import order).
- `npm run typecheck` runs `tsc` over the app and all workspaces.
- `npm run format` rewrites files with the Biome formatter.
- `npm test` runs the Vitest unit and integration tests once.
- `npm run test:e2e` runs the Playwright end-to-end tests in Chromium (first run `npx playwright install chromium`).
- `npm run auth:generate` regenerates the Better Auth tables in `lib/auth-schema.ts` after auth options or plugins change.
- `npm run db:generate` writes a migration from changes in `lib/schema.ts`.
- `npm run db:migrate` applies pending migrations to the database in `DATABASE_URL`.
- `npm run db:reset` deletes the local database file and migrates a fresh one.
- `npm run db:seed` adds the demo user `demo@todo-cat.dev` (password `cat-person-2026`) with sample todos; rerunning resets them.

## Definition of done

- Run `npm run qa` before you call a task done, and only call it done when it passes.
- Fix the code behind a finding instead of suppressing it (no ignore comments, disabled rules, skipped tests or loosened types).
- CI runs the same script on every push and pull request.

## Verify, don't recall

- Next.js, React, Tailwind, TypeScript, Biome and Drizzle here are newer than your training data.
- Check APIs against current docs (see "Researching docs") before writing code, not against memory.

## Researching docs

- Next.js: the version-matched guides in `node_modules/next/dist/docs/`.
- Drizzle: start at https://orm.drizzle.team/llms.txt and follow its `docs/sqlite/…` links, which cover the v1 RC installed here.
- Drizzle Kit also ships agent skills for its CLI output and migrations in `node_modules/drizzle-kit/skills/`.
- Better Auth: start at https://better-auth.com/llms.txt; every docs page is also served as Markdown at its URL plus `.md`.
- Other vendors: check for an `llms.txt` at the docs site root before anything else.
- Installed skills in `.agents/skills/` and `.claude/skills/` (e.g. `frontend-design`, `impeccable`) carry vetted guidance; use them when the task matches.
- Any other library: the `ctx7` CLI from the `find-docs` skill (`npx ctx7@latest library <name> "<query>"`, then `docs <id> "<query>"`) is the fallback.

## Tech docs

`tech-docs/` holds project-specific technical docs; agents are the primary audience.

- Describe approach, principles, design decisions with their reasons, and gotchas.
- Point to the central files instead of copying code.
- Leave out anything an agent finds out by reading the code.
- Current state only: delete outdated content instead of adding caveats.

Index:

- [architecture.md](tech-docs/architecture.md) — the todo service, its adapters, the data model and the contract: start here for any todo feature.
- [workspaces.md](tech-docs/workspaces.md) — the npm workspace layout and why it exists before its content does.
- [rest-api.md](tech-docs/rest-api.md) — the `/api/todos` endpoints, their schemas and status codes, and getting a bearer token with curl.
- [testing.md](tech-docs/testing.md) — test strategy, the QA script, CI, and gotchas for Vitest and Playwright.
- [database.md](tech-docs/database.md) — Drizzle on SQLite: the single db module, migrations, env loading and test databases.
- [auth.md](tech-docs/auth.md) — Better Auth: the one session helper, plugins, schema generation, env and tests.
- [cli.md](tech-docs/cli.md) — the `todo-cat` CLI: commands, JSON output and exit codes, device login, token storage and its end-to-end test.

## Keeping this map current

- When a change invalidates a line here or in `tech-docs/`, or teaches a costly lesson, update them in the same change.
- Prefer deleting over adding, pointers over prose, one sentence per bullet.
