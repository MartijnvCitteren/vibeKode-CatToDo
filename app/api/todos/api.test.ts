import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { errorBodySchema, type Todo, todoSchema } from "@todo-cat/contract";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

let dir: string;
let db: typeof import("@/lib/db").db;
let auth: typeof import("@/lib/auth").auth;
let todos: typeof import("./route");
let todo: typeof import("./[id]/route");

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "todo-cat-api-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-characters";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  // Imported after the env is set, because lib/db.ts and Better Auth read it on load.
  ({ db } = await import("@/lib/db"));
  await migrate(db, { migrationsFolder: "drizzle" });
  ({ auth } = await import("@/lib/auth"));
  todos = await import("./route");
  todo = await import("./[id]/route");
});

afterAll(async () => {
  db?.$client.close();
  await rm(dir, { recursive: true, force: true });
});

// Signs up a fresh user and returns the bearer token sign-in hands out, as a client would get it.
async function signUp(): Promise<string> {
  const credentials = {
    email: `${crypto.randomUUID()}@example.com`,
    password: "scratching-post",
  };
  await auth.api.signUpEmail({ body: { name: "Lissie", ...credentials } });
  const { headers } = await auth.api.signInEmail({
    body: credentials,
    returnHeaders: true,
  });
  const token = headers.get("set-auth-token");
  if (!token) throw new Error("Sign-in returned no bearer token");
  return token;
}

function request(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Request {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers,
    // A string goes out as is, so tests can send a body that isn't JSON.
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

// One function per endpoint, each calling the route handler the way Next.js would.
const api = {
  list: (token?: string, query = "") =>
    todos.GET(request("GET", `/api/todos${query}`, token)),
  add: (token: string | undefined, body: unknown) =>
    todos.POST(request("POST", "/api/todos", token, body)),
  get: (token: string | undefined, id: string) =>
    todo.GET(request("GET", `/api/todos/${id}`, token), params(id)),
  update: (token: string | undefined, id: string, body: unknown) =>
    todo.PATCH(request("PATCH", `/api/todos/${id}`, token, body), params(id)),
  remove: (token: string | undefined, id: string) =>
    todo.DELETE(request("DELETE", `/api/todos/${id}`, token), params(id)),
};

async function todoFrom(response: Response): Promise<Todo> {
  return todoSchema.parse(await response.json());
}

async function errorFrom(response: Response) {
  return errorBodySchema.parse(await response.json()).error;
}

describe("unauthorized", () => {
  const id = crypto.randomUUID();
  const endpoints: Record<string, (token?: string) => Promise<Response>> = {
    "GET /api/todos": (token) => api.list(token),
    "POST /api/todos": (token) => api.add(token, { title: "Nap" }),
    "GET /api/todos/:id": (token) => api.get(token, id),
    "PATCH /api/todos/:id": (token) => api.update(token, id, { done: true }),
    "DELETE /api/todos/:id": (token) => api.remove(token, id),
  };

  for (const [endpoint, call] of Object.entries(endpoints)) {
    test(`${endpoint} answers 401 without a token`, async () => {
      const response = await call();
      expect(response.status).toBe(401);
      expect((await errorFrom(response)).code).toBe("unauthorized");
    });

    test(`${endpoint} answers 401 with an invalid token`, async () => {
      const response = await call("not-a-session");
      expect(response.status).toBe(401);
      expect((await errorFrom(response)).code).toBe("unauthorized");
    });
  }
});

test("adds, lists, completes, filters and deletes a todo with a bearer token", async () => {
  const token = await signUp();

  const added = await api.add(token, {
    title: "Buy tuna",
    dueDate: "2026-10-31",
  });
  expect(added.status).toBe(201);
  const tuna = await todoFrom(added);
  expect(tuna).toMatchObject({
    title: "Buy tuna",
    dueDate: "2026-10-31",
    done: false,
  });
  const nap = await todoFrom(await api.add(token, { title: "Nap" }));

  const listed = await api.list(token);
  expect(listed.status).toBe(200);
  expect(await listed.json()).toEqual([tuna, nap]);

  const updated = await api.update(token, tuna.id, { done: true });
  expect(updated.status).toBe(200);
  const done = await todoFrom(updated);
  expect(done).toMatchObject({ id: tuna.id, done: true });
  expect(done.completedAt).not.toBeNull();

  expect(await (await api.list(token, "?status=done")).json()).toEqual([done]);
  expect(await (await api.list(token, "?status=open")).json()).toEqual([nap]);
  expect(await (await api.list(token, "?search=TUNA")).json()).toEqual([done]);
  expect(await (await api.get(token, tuna.id)).json()).toEqual(done);

  const removed = await api.remove(token, tuna.id);
  expect(removed.status).toBe(204);
  expect(await removed.text()).toBe("");
  expect(await (await api.list(token)).json()).toEqual([nap]);
  const gone = await api.get(token, tuna.id);
  expect(gone.status).toBe(404);
  expect((await errorFrom(gone)).code).toBe("todo-not-found");
});

test("treats another user's todo id as not found and leaves the todo alone", async () => {
  const alice = await signUp();
  const bob = await signUp();
  const secret = await todoFrom(await api.add(alice, { title: "Secret" }));

  for (const response of [
    await api.get(bob, secret.id),
    await api.update(bob, secret.id, { title: "Stolen" }),
    await api.remove(bob, secret.id),
  ]) {
    expect(response.status).toBe(404);
    expect((await errorFrom(response)).code).toBe("todo-not-found");
  }
  expect(await (await api.list(bob)).json()).toEqual([]);
  expect(await (await api.get(alice, secret.id)).json()).toEqual(secret);
});

describe("invalid input", () => {
  let token: string;
  let id: string;

  beforeAll(async () => {
    token = await signUp();
    id = (await todoFrom(await api.add(token, { title: "Groom" }))).id;
  });

  const cases: Record<string, () => Promise<Response>> = {
    "a todo without a title": () => api.add(token, { dueDate: "2026-10-31" }),
    "a misspelled field": () => api.add(token, { title: "Nap", due: "soon" }),
    "a due date with a time": () =>
      api.add(token, { title: "Nap", dueDate: "2026-10-31T10:00:00Z" }),
    "a body that isn't JSON": () => api.add(token, "title=Nap"),
    "an update without changes": () => api.update(token, id, {}),
    "an unknown status filter": () => api.list(token, "?status=later"),
    "an unknown query parameter": () => api.list(token, "?sort=title"),
  };

  for (const [name, call] of Object.entries(cases)) {
    test(`answers 400 validation-failed for ${name}`, async () => {
      const response = await call();
      expect(response.status).toBe(400);
      const error = await errorFrom(response);
      expect(error.code).toBe("validation-failed");
      expect(error.message).not.toBe("");
    });
  }

  test("leaves the todo unchanged after a rejected update", async () => {
    expect((await api.update(token, id, { title: " " })).status).toBe(400);
    expect((await todoFrom(await api.get(token, id))).title).toBe("Groom");
  });
});
