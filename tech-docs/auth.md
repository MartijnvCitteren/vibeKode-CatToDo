# Authentication

## Approach

- Better Auth (`better-auth`, `@better-auth/drizzle-adapter` and the `auth` CLI, all pinned at exactly 1.7.7) with email and password only.
- `lib/auth.ts` is the server-only Better Auth instance on the Drizzle adapter over `lib/db.ts`; `app/api/auth/[...all]/route.ts` mounts its HTTP endpoints.
- `getUserId` in `lib/session.ts` is the only code that reads sessions: it maps a request (session cookie or `Authorization: Bearer <token>`) to the user id or null.
- Pages, Server Actions and every adapter (REST, the CopilotKit runtime, later agent tools and MCP) call `getUserId` and load what else they need by user id, rather than calling `auth.api.getSession` themselves.
- Signup, login and sign-out are Server Actions in `app/auth-actions.ts`; the `nextCookies` plugin lets them set and clear the session cookie, so the browser needs no Better Auth client yet.
- `/` checks the session server-side and redirects to `/login`; `app/(auth)/layout.tsx` sends signed-in users away from `/login` and `/signup`.
- `/login` and `/signup` take `?next=` and return there after success; `nextPath` in `lib/next-path.ts` accepts only a same-site path, so the link cannot redirect off-site.
- Shared form styling lives in `components/ui/` (`Card`, `Form`, `Field`, `Button`, `FormError`, `TextLink`); pages compose these instead of repeating class strings.

## Plugins

- `bearer` turns `Authorization: Bearer <token>` into a session lookup, for the REST API and the CLI; sign-in responses carry the token in the `set-auth-token` header.
- `deviceAuthorization` is the CLI's `gh auth login`-style flow; it accepts only the client id `CLI_CLIENT_ID` (`todo-cat-cli`, from the contract) and points users at `/device` (see [cli.md](cli.md)).
- The device flow ends in a raw, unsigned session token, so `bearer` must keep its default `requireSignature: false`.
- `nextCookies` must stay the last plugin, which is why `lib/auth.ts` appends it after the shared ones.

## Schema and migrations

- `lib/auth-options.ts` holds every option that shapes tables and endpoints, and imports neither `server-only` nor the database.
- The CLI cannot load a module that imports `server-only` (it fails with a "remove import 'server-only'" hint), so `npm run auth:generate` points it at `scripts/auth-cli.config.mts`, which pairs those options with a throwaway in-memory database.
- `npm run auth:generate` writes `lib/auth-schema.ts`, which `lib/schema.ts` re-exports; then `npm run db:generate` writes the migration and `npm run db:migrate` applies it, like any other table change.
- Rerun `auth:generate` and `db:generate` whenever a Better Auth plugin or auth option changes.
- The adapter is the Relations v2 variant (`@better-auth/drizzle-adapter/relations-v2`), because Drizzle here is v1; the generated `authRelations` are passed to `drizzle()` in `lib/db.ts`.

## Environment

- `BETTER_AUTH_SECRET` signs cookies and tokens; it is empty in `.env.example` so CI fills it with a random dummy (generate a real one with `openssl rand -base64 32`).
- `BETTER_AUTH_URL` is the app's own origin, and Better Auth rejects requests from any other origin; the Playwright server sets it to its random-port URL.

## Tests

- `lib/auth.test.ts` migrates a temp database, imports the real `auth` and `getUserId`, and builds a sibling instance from `auth.options` plus `testUtils()` that shares database and secret.
- `testUtils` never goes into `lib/auth.ts`: it exposes privileged helpers that create sessions without a password.
- `e2e/auth.spec.ts` runs the real browser flow: sign up, sign out, a rejected password, sign in.

## Gotchas

- Set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` before importing `lib/auth.ts` in a test, because Better Auth reads them when the instance is created.
- `redirect()` throws, so the Server Actions call it after their `try`/`catch`, never inside.
- Next.js renders its route announcer with `role="alert"` too, so e2e tests scope form errors to `main`.
