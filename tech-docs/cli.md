# CLI

`todo-cat` (workspace `cli/`, package `todo-cat-cli`) is a client of the REST API (see [rest-api.md](rest-api.md)), built on commander.js 15. Its main users are AI agents working for a human, so its output, errors and exit codes are a stable interface.

## Running it

- `npx todo-cat --help` from the repo root; `npm install` builds it through the workspace's `prepare` script and links the bin.
- `npm run build -w todo-cat-cli` rebuilds it after a change; the bin runs the bundle, never the source.
- `TODO_CAT_URL` picks the server (default `http://localhost:3000`), and `TODO_CAT_CONFIG_DIR` the config directory.

## Layout

- `cli/src/program.ts` holds the command tree and `run`, which turns errors into stderr output and an exit code.
- `cli/src/api.ts` is the REST client and `cli/src/auth.ts` the login, whoami and logout calls.
- `cli/src/errors.ts` defines the error codes and the exit code table that `--help` prints.
- `cli/src/config.ts` resolves the server URL and reads and writes the credentials file.
- `cli/bin/todo-cat.js` is a committed shim that imports `dist/todo-cat.js`, so npm can link the bin before the first build.

## Decisions

- One command per REST use case (`list`, `show`, `add`, `edit`, `done`, `reopen`, `delete`), plus `login`, `logout` and `whoami`.
- Request bodies and responses go through the contract schemas, so a bad input fails before any request and a server that breaks the shape fails as `unexpected-response`.
- Input is validated before the token is read, so a bad input reports `validation-failed` even when logged out.
- Login, whoami and logout use Better Auth's own client (`better-auth/client` with `deviceAuthorizationClient`) instead of re-declaring its endpoint shapes; `CLI_CLIENT_ID` lives in the contract because server and CLI must agree on it.
- esbuild bundles the CLI with every dependency into one ESM file, because the contract is TypeScript source without a build step; so all its dependencies are devDependencies.

## Agent-facing interface

- `--json` prints results as JSON on stdout and errors as `{"error":{"code","message"}}` on stderr, the REST error body shape with the CLI's own codes added.
- Without `--json`, errors are `error: <message> (<code>)` on stderr.
- Exit codes group what to do next: 1 failure, 2 bad input, 3 not logged in, 4 no such todo, 5 server unreachable; the table in `cli/src/errors.ts` is the single source.
- Nothing prompts; `delete` refuses without `--yes` (`confirmation-required`, exit 2).
- `login` blocks until approval, printing the code and URL on stderr first, so an agent should run it in the background and relay the code to its human.

## Login and the token

- `login` runs Better Auth's device authorization flow: it prints the code and `/device` URL, never opens a browser, and polls `/api/auth/device/token` at the server's interval, slowing down on `slow_down`.
- `app/device/page.tsx` is where a signed-in user approves or denies the code; signed out, it goes through `/login?next=…` and comes back (see [auth.md](auth.md)).
- The token is a raw session token sent as `Authorization: Bearer`, stored in `credentials.json` in the config directory (`$XDG_CONFIG_HOME/todo-cat`, `~/.config/todo-cat` or `%APPDATA%\todo-cat`).
- Tokens are keyed by server URL, so pointing `TODO_CAT_URL` elsewhere never sends a token to the wrong server.
- The file is written owner-only (0600, directory 0700) to a temp file and renamed into place; no command ever prints the token.
- A new login revokes the session it replaces; `logout` revokes the session on the server with `sign-out` and only then deletes the token, so a failed revoke can be retried.

## Tests

- `cli/src/cli.test.ts` builds the CLI, starts `next dev` on a spare port with a temp database, and drives the built bin with a temp `TODO_CAT_CONFIG_DIR`.
- It approves the device code in-process through a sibling Better Auth instance with `testUtils` (as in `lib/auth.test.ts`), sharing the server's database file and secret.
- `e2e/device.spec.ts` covers the `/device` page in a browser: signup through the `next` redirect, approve, then a token that the REST API accepts.

## Gotchas

- The test server builds into `.next/cli-e2e`, so it runs beside `npm run dev` and the Playwright server; its `tsconfig.json` include entries are committed for the same reason as `.next/e2e` (see [testing.md](testing.md)).
- Commander copies `exitOverride` and `configureOutput` to subcommands only when they are created, so `buildProgram` sets them before adding commands.
- Better Auth's device endpoints put their text in `error_description`, not `message`.
- `GET /device` binds a pending code to the session that calls it, and approval fails with "not claimed" without it, so the approve action calls `deviceVerify` first.
