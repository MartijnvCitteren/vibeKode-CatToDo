# Workspaces

## Layout

- The repo root is the Next.js web app and also the npm workspace root (`workspaces` in `package.json`).
- `contract/` (package `@todo-cat/contract`) holds the zod schemas shared by the web app and the CLI (see [architecture.md](architecture.md)).
- `cli/` (package `todo-cat-cli`) holds the `todo-cat` command-line client (see [cli.md](cli.md)).

## Why the workspaces exist

- The web app and the CLI must agree on the shape of to-dos and API payloads, so that agreement gets one home (`contract/`) instead of being duplicated and drifting.
- Fixing the package boundaries up front means the first schema or CLI command lands in the right place instead of inside `app/` and being moved later.
- One root `package-lock.json` and one `npm install` cover all packages, and npm links `@todo-cat/contract` into `node_modules` so the app and CLI import it by name.

## Gotchas

- `contract/` has no build step: its `exports` point at `src/index.ts`, which Turbopack (it transpiles workspace packages by itself), Vitest, `tsc` and `tsx` all compile directly.
- Add a dependency to a workspace with `npm install <pkg> -w contract` (or `-w cli`); without `-w` it lands in the root app's `package.json`.
