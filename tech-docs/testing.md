# Testing

## Strategy

- Vitest runs unit and integration tests; Playwright runs end-to-end tests in a real browser against a real Next.js server.
- Push logic down into plain functions and synchronous components that Vitest can reach, and keep Playwright for user flows and anything rendered by an `async` Server Component (Vitest cannot render those, per the Next.js testing guide).
- Unit and integration tests sit next to the code they test (`components/ui/field.test.tsx`, `lib/auth.test.ts`); end-to-end tests live in `e2e/` as `*.spec.ts`.
- The file extension picks the Vitest environment: `*.test.ts` runs in Node (for `contract/`, `cli/` and server code), `*.test.tsx` runs in jsdom with React Testing Library (see `vitest.config.mts`).
- Playwright tests Chromium only, to keep runs fast; add projects in `playwright.config.ts` only when a browser-specific bug justifies it.

## Commands

- `npm run qa` (`scripts/qa.sh`) runs Biome, typecheck, production build, the CLI build, Vitest and Playwright; it is the done-check for every task and the whole CI job.
- `npm test` runs Vitest once across the app and both workspaces; `npm run test:watch` keeps it watching.
- `npm run test:e2e` runs Playwright, which starts its own `next dev` on a free port and stops it afterwards.
- `npx playwright install chromium` downloads the browser; run it once per machine and after upgrading `@playwright/test`.
- `npx playwright test --ui` or `--debug` opens Playwright's interactive runner.

## QA script

- Every section runs even after an earlier one fails, so one run reports all problems; the exit code is 1 if any section failed.
- Each section prints one `PASS`/`FAIL` line; only failing sections print their output, and the full output of every section goes to `.qa/qa.log` (override with `QA_LOG`).
- Output is plain for agents: `NO_COLOR`, `FORCE_COLOR=0` and `biome --colors=off` strip colors, and findings keep their file and line (`app/page.tsx:4:3`, `lib/db.ts(10,14)`).
- `npm run typecheck` runs `next typegen` first, because the global route types (`LayoutProps`, `PageProps`) live in generated `.next/types` that a fresh checkout lacks, then `tsc` over the root project, which also covers `contract/` and `cli/`, and then each workspace's own `typecheck` script once one exists.
- A type error fails both `typecheck` and `build`, because `next build` type-checks too.
- A long-lived checkout hides missing generated or untracked files (`.next/types`, empty folders), so verify changes to setup in a fresh clone, as CI does.

## Isolation of the Playwright server

- The e2e server must never collide with `npm run dev` or with another checkout running at the same time, so its port, build dir and database are separate and overridable.
- `E2E_PORT` defaults to a free port, `E2E_DIST_DIR` to `.next/e2e`, and `E2E_DATABASE_URL` to a file in a fresh temp dir that the global teardown deletes.
- A database passed in through `E2E_DATABASE_URL` is migrated but never deleted.

## CI

- `.github/workflows/qa.yml` runs `npm run qa` on every push and pull request with Node 24 and `npm ci`; it does not deploy.
- Playwright browsers are cached by Playwright version, and `playwright install --with-deps` still runs on a cache hit to install Chromium's system libraries.
- CI builds `.env` from `.env.example` and fills every empty value with a random dummy, so a new secret belongs in `.env.example` with an empty value and never in GitHub secrets for tests.
- On failure the job uploads `.qa/` and `test-results/` as the `qa-results` artifact.
- With `CI` set, Playwright switches to the `github` reporter, forbids `test.only` and retries failures twice (see `playwright.config.ts`).

## Gotchas

- Vitest test globals are off, so import `test`, `expect` and friends from `vitest`, and Testing Library's auto-cleanup is wired up by hand in `vitest.setup.ts`.
- The Node project mocks `server-only` in `vitest.setup.node.ts`, so tests can import server modules such as `lib/db.ts`.
- Tests never use `data/app.db`: Vitest and the Playwright server each migrate their own temp database (see [database.md](database.md)).
- The Playwright server reads `BETTER_AUTH_SECRET` from `.env` and gets `BETTER_AUTH_URL` from `playwright.config.ts` (see [auth.md](auth.md)).
- Next.js holds a lock on its dev build dir, so a second `next dev` in the same project exits with "Another next dev server is already running"; the Playwright server therefore builds into `E2E_DIST_DIR` via `NEXT_DIST_DIR` (read in `next.config.ts`) and can run beside `npm run dev`.
- Next.js adds include entries to `tsconfig.json` for every build dir it sees and reformats the file when it does, which fails `biome check`; the `.next/e2e` and `.next/cli-e2e` (the CLI test's server, see [cli.md](cli.md)) entries are committed so that rewrite never happens, so an `E2E_DIST_DIR` elsewhere dirties `tsconfig.json`.
- Playwright re-evaluates its config in each worker, so the free port is picked once and passed to workers through `E2E_PORT`; set `E2E_PORT` yourself to pin it.
- Path aliases (`@/…`) resolve through Vite's built-in `resolve.tsconfigPaths`, so the `vite-tsconfig-paths` plugin from the Next.js guide is not needed.
