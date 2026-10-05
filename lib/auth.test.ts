import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { betterAuth } from "better-auth";
import { type TestHelpers, testUtils } from "better-auth/plugins";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

let dir: string;
let db: typeof import("./db").db;
let auth: typeof import("./auth").auth;
let getUserId: typeof import("./session").getUserId;
let helpers: TestHelpers;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "todo-cat-auth-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-characters";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  // Imported after the env is set, because lib/db.ts and Better Auth read it on load.
  ({ db } = await import("./db"));
  await migrate(db, { migrationsFolder: "drizzle" });
  ({ auth } = await import("./auth"));
  ({ getUserId } = await import("./session"));
  // testUtils stays out of the app's auth; this sibling shares its options, database and secret.
  const testAuth = betterAuth({
    ...auth.options,
    plugins: [...auth.options.plugins, testUtils()],
  });
  helpers = (await testAuth.$context).test;
});

afterAll(async () => {
  db?.$client.close();
  await rm(dir, { recursive: true, force: true });
});

describe("email and password", () => {
  const credentials = { email: "lissie@example.com", password: "tuna-o-clock" };

  test("signs up a new user", async () => {
    const { user } = await auth.api.signUpEmail({
      body: { name: "Lissie", ...credentials },
    });
    expect(user).toMatchObject({ name: "Lissie", email: credentials.email });
  });

  test("signs in with the right password", async () => {
    const { user, token } = await auth.api.signInEmail({ body: credentials });
    expect(user.email).toBe(credentials.email);
    expect(token).toBeTruthy();
  });

  test("rejects a wrong password", async () => {
    await expect(
      auth.api.signInEmail({
        body: { ...credentials, password: "not-the-password" },
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("getUserId", () => {
  test("returns the user id for a session cookie", async () => {
    const user = await helpers.saveUser(helpers.createUser());
    const headers = await helpers.getAuthHeaders({ userId: user.id });
    expect(await getUserId({ headers })).toBe(user.id);
  });

  test("returns the user id for the bearer token sign-in hands out", async () => {
    const credentials = {
      email: "bearer@example.com",
      password: "scratching-post",
    };
    const { user } = await auth.api.signUpEmail({
      body: { name: "Bearer", ...credentials },
    });
    const { headers } = await auth.api.signInEmail({
      body: credentials,
      returnHeaders: true,
    });
    const token = headers.get("set-auth-token");
    expect(token).toBeTruthy();
    expect(
      await getUserId({
        headers: new Headers({ Authorization: `Bearer ${token}` }),
      }),
    ).toBe(user.id);
  });

  test("returns the user id for a raw session token as bearer", async () => {
    // Device login hands the CLI the unsigned session token rather than the signed cookie value.
    const user = await helpers.saveUser(helpers.createUser());
    const { token } = await helpers.login({ userId: user.id });
    expect(
      await getUserId({
        headers: new Headers({ Authorization: `Bearer ${token}` }),
      }),
    ).toBe(user.id);
  });

  test("returns null without a cookie or bearer token", async () => {
    expect(await getUserId({ headers: new Headers() })).toBeNull();
    expect(
      await getUserId({
        headers: new Headers({ Authorization: "Bearer not-a-session" }),
      }),
    ).toBeNull();
  });
});
