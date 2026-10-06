# REST API

`/api/todos` is the REST adapter over the todo service (see [architecture.md](architecture.md)), for non-browser clients such as the CLI.

## Endpoints

Schemas are from `@todo-cat/contract`; every error body is `errorBodySchema`, and every endpoint answers 401 `unauthorized` without a valid bearer token or session cookie.

- `GET /api/todos?status=&search=` — query `todoFilterSchema` → 200 `todoSchema[]`; 400 `validation-failed`.
- `POST /api/todos` — body `newTodoSchema` → 201 `todoSchema`; 400 `validation-failed`.
- `GET /api/todos/:id` → 200 `todoSchema`; 404 `todo-not-found`.
- `PATCH /api/todos/:id` — body `todoChangesSchema` → 200 `todoSchema`; 400 `validation-failed`, 404 `todo-not-found`.
- `DELETE /api/todos/:id` → 204 with no body; 404 `todo-not-found`.

## OpenAPI spec

- `contract/openapi.json` is the OpenAPI 3.1 description of these endpoints, for API tools and generated clients; never edit it by hand.
- `contract/src/openapi.ts` builds it: the schemas come from the contract through `z.toJSONSchema`, the paths, status codes and descriptions are written there.
- `npm run openapi` rewrites the file, and `contract/src/openapi.test.ts` fails while the committed file differs from the generated one, so change a contract schema or an endpoint, then rerun it.
- Schemas are converted in `io: "input"` mode, so the defaulted `status` filter is optional; response schemas have no defaults or transforms, so input and output are the same for them.
- A zod `refine` has no JSON Schema form: the "at least one change" rule of `todoChangesSchema` is added by hand as `minProperties: 1`, and a new refine needs the same treatment.
- `npx @redocly/cli lint contract/openapi.json` validates the file; its only warnings are the missing license and the localhost server.

## Getting a bearer token with curl

Sign in and read the token from the `set-auth-token` response header (the `bearer` plugin, see [auth.md](auth.md)):

```sh
TOKEN=$(curl -s -D - -o /dev/null http://localhost:3000/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@todo-cat.dev","password":"cat-person-2026"}' \
  | grep -i '^set-auth-token:' | cut -d' ' -f2 | tr -d '\r')

curl -s 'http://localhost:3000/api/todos?status=open' -H "Authorization: Bearer $TOKEN"
```

## Design

- The routes in `app/api/todos/` only parse, call the service and pick a status; `app/api/todos/rest.ts` holds the shared plumbing (`respond`, `parse`, `parseBody`).
- Authentication runs before validation, so an unauthenticated client gets 401 even for a malformed request.
- The query string is parsed with the strict `todoFilterSchema`, so an unknown parameter is a 400, like a misspelled body field.
- A body that isn't JSON is a 400 `validation-failed`; the message is zod's `prettifyError` output and is meant for humans, not for parsing.
- Errors other than `TodoError` are rethrown and become Next.js's 500.

## Tests

- `app/api/todos/api.test.ts` calls the route handlers directly on a temp database with real bearer tokens from Better Auth sign-in, passing `{ params: Promise.resolve({ id }) }` as the route context.
- It covers 401 without and with an invalid token for every endpoint, a full add-list-complete-filter-delete flow, another user's id as 404, and 400 for invalid input.
