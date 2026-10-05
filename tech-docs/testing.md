# Testing

## Strategy

- Vitest runs unit and integration tests; Playwright runs end-to-end tests in a real browser against a real Next.js server.
- Push logic down into plain functions and synchronous components that Vitest can reach, and keep Playwright for user flows and anything rendered by an `async` Server Component (Vitest cannot render those, per the Next.js testing guide).
- Unit and integration tests sit next to the code they test (`app/page.test.tsx`); end-to-end tests live in `e2e/` as `*.spec.ts`.
- The file extension picks the Vitest environment: `*.test.ts` runs in Node (for `contract/`, `cli/` and server code), `*.test.tsx` runs in jsdom with React Testing Library (see `vitest.config.mts`).
- Playwright tests Chromium only, to keep runs fast; add projects in `playwright.config.ts` only when a browser-specific bug justifies it.

## Commands

- `npm test` runs Vitest once across the app and both workspaces; `npm run test:watch` keeps it watching.
- `npm run test:e2e` runs Playwright, which starts its own `next dev` on a free port and stops it afterwards.
- `npx playwright install chromium` downloads the browser; run it once per machine and after upgrading `@playwright/test`.
- `npx playwright test --ui` or `--debug` opens Playwright's interactive runner.

## Gotchas

- Vitest test globals are off, so import `test`, `expect` and friends from `vitest`, and Testing Library's auto-cleanup is wired up by hand in `vitest.setup.ts`.
- The Node project mocks `server-only` in `vitest.setup.node.ts`, so tests can import server modules such as `lib/db.ts`.
- Tests never use `data/app.db`: Vitest and the Playwright server each migrate their own temp database (see [database.md](database.md)).
- Next.js holds a lock on its dev build dir, so a second `next dev` in the same project exits with "Another next dev server is already running"; the Playwright server therefore builds into `.next/e2e` via `NEXT_DIST_DIR` (read in `next.config.ts`) and can run beside `npm run dev`.
- Next.js adds include entries to `tsconfig.json` for every build dir it sees and reformats the file when it does, which fails `biome check`; the `.next/e2e` entries are committed so that rewrite never happens.
- Playwright re-evaluates its config in each worker, so the free port is picked once and passed to workers through `E2E_PORT`; set `E2E_PORT` yourself to pin it.
- Path aliases (`@/…`) resolve through Vite's built-in `resolve.tsconfigPaths`, so the `vite-tsconfig-paths` plugin from the Next.js guide is not needed.
