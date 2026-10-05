import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Todo, todoSchema } from "@todo-cat/contract";
import { betterAuth } from "better-auth";
import { type TestHelpers, testUtils } from "better-auth/plugins";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";

// Drives the built CLI end to end (see tech-docs/cli.md): a real `next dev` on a spare port with a
// temp database, a redirected config directory, and device login approved through Better Auth's testUtils.

const root = join(import.meta.dirname, "../..");
const secret = "test-secret-that-is-at-least-32-characters";

let dir: string;
let server: ChildProcess;
let serverLog = "";
let baseUrl: string;
let configDir: string;
let db: typeof import("@/lib/db").db;
let helpers: TestHelpers;
let approveDevice: (userCode: string, headers: Headers) => Promise<void>;
const outputs: string[] = [];

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer().listen(0, () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("No port")),
      );
    });
  });

async function waitForServer(deadline: number) {
  while (Date.now() < deadline) {
    if (server.exitCode !== null) break;
    // 401 means the REST route compiled and answers; anything else means not ready yet.
    const status = await fetch(`${baseUrl}/api/todos`).then(
      (response) => response.status,
      () => 0,
    );
    if (status === 401) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The test server did not come up:\n${serverLog}`);
}

beforeAll(async () => {
  execFileSync("npm", ["run", "build", "-w", "todo-cat-cli"], { cwd: root });

  dir = await mkdtemp(join(tmpdir(), "todo-cat-cli-"));
  configDir = join(dir, "config");
  const port = await freePort();
  baseUrl = `http://localhost:${port}`;
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  process.env.BETTER_AUTH_SECRET = secret;
  process.env.BETTER_AUTH_URL = baseUrl;

  // Imported after the env is set, because lib/db.ts and Better Auth read it on load.
  ({ db } = await import("@/lib/db"));
  await migrate(db, { migrationsFolder: join(root, "drizzle") });
  const { auth } = await import("@/lib/auth");
  // testUtils stays out of the app's auth; this sibling shares its options, database and secret.
  const testAuth = betterAuth({
    ...auth.options,
    plugins: [...auth.options.plugins, testUtils()],
  });
  helpers = (await testAuth.$context).test;
  // What the /device page does: bind the code to the user's session, then approve it.
  approveDevice = async (userCode, headers) => {
    await testAuth.api.deviceVerify({
      query: { user_code: userCode },
      headers,
    });
    await testAuth.api.deviceApprove({ body: { userCode }, headers });
  };

  server = spawn(
    process.execPath,
    [join(root, "node_modules/next/dist/bin/next"), "dev", "--port", `${port}`],
    {
      cwd: root,
      // Its own build dir, so it runs beside `npm run dev` and the Playwright server.
      // Vitest sets NODE_ENV=test, which next dev warns about.
      env: {
        ...process.env,
        NODE_ENV: "development",
        NEXT_DIST_DIR: ".next/cli-e2e",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  server.stdout?.on("data", (chunk) => {
    serverLog += chunk;
  });
  server.stderr?.on("data", (chunk) => {
    serverLog += chunk;
  });
  await waitForServer(Date.now() + 120_000);
}, 180_000);

afterAll(async () => {
  // detached gives next dev its own process group, so this also stops its workers.
  if (server?.pid && server.exitCode === null) process.kill(-server.pid);
  db?.$client.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

type Result = { code: number | null; stdout: string; stderr: string };

/** Runs the built CLI the way an agent would; `onStderr` sees stderr as it streams. */
function cli(args: string[], onStderr?: (text: string) => void) {
  return new Promise<Result>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(root, "cli/bin/todo-cat.js"), ...args],
      {
        env: {
          ...process.env,
          TODO_CAT_URL: baseUrl,
          TODO_CAT_CONFIG_DIR: configDir,
        },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      onStderr?.(stderr);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      outputs.push(stdout, stderr);
      resolve({ code, stdout, stderr });
    });
  });
}

const json = <S extends z.ZodType>(schema: S, text: string): z.infer<S> =>
  schema.parse(JSON.parse(text));

// The API's error body shape, with the CLI's own codes (confirmation-required, …) allowed too.
const cliErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

const errorCode = (result: Result) =>
  json(cliErrorSchema, result.stderr).error.code;

const credentialsFile = () => join(configDir, "credentials.json");

async function storedToken(): Promise<string | undefined> {
  const credentials = JSON.parse(await readFile(credentialsFile(), "utf8"));
  return credentials[baseUrl]?.token;
}

const userSchema = z.object({ email: z.string() });

describe("the todo-cat CLI against a real server", () => {
  let email: string;
  let token: string;
  let tuna: Todo;
  let nap: Todo;

  test("whoami fails with exit code 3 before login", async () => {
    const result = await cli(["whoami", "--json"]);
    expect(result.code).toBe(3);
    expect(errorCode(result)).toBe("unauthorized");
  });

  test("reports usage errors as one JSON line with exit code 2", async () => {
    const result = await cli(["add", "--json"]);
    expect(result.code).toBe(2);
    expect(errorCode(result)).toBe("usage");
  });

  test("logs in with a device code that a signed-in user approves", async () => {
    const user = await helpers.saveUser(helpers.createUser());
    email = user.email;
    const headers = await helpers.getAuthHeaders({ userId: user.id });

    let approval: Promise<unknown> | undefined;
    const result = await cli(["login", "--json"], (stderr) => {
      const userCode = stderr.match(/enter the code ([A-Z0-9-]+)/)?.[1];
      if (!userCode || approval) return;
      approval = approveDevice(userCode, headers);
    });

    await approval;
    expect(result.code, result.stderr).toBe(0);
    expect(json(z.object({ user: userSchema }), result.stdout).user.email).toBe(
      email,
    );

    token = (await storedToken()) ?? "";
    expect(token).not.toBe("");
    if (process.platform !== "win32") {
      expect((await stat(credentialsFile())).mode & 0o777).toBe(0o600);
    }
  }, 30_000);

  test("whoami shows the logged-in user", async () => {
    const result = await cli(["whoami", "--json"]);
    expect(result.code).toBe(0);
    expect(json(z.object({ user: userSchema }), result.stdout).user.email).toBe(
      email,
    );
  });

  test("adds todos", async () => {
    const added = await cli([
      "add",
      "Buy tuna",
      "--due",
      "2026-10-31",
      "--json",
    ]);
    expect(added.code).toBe(0);
    tuna = json(todoSchema, added.stdout);
    expect(tuna).toMatchObject({
      title: "Buy tuna",
      dueDate: "2026-10-31",
      done: false,
    });
    nap = json(todoSchema, (await cli(["add", "Nap", "--json"])).stdout);
  });

  test("rejects invalid input before sending it, with exit code 2", async () => {
    const result = await cli(["add", "Nap", "--due", "tomorrow", "--json"]);
    expect(result.code).toBe(2);
    expect(errorCode(result)).toBe("validation-failed");
  });

  test("lists todos", async () => {
    const result = await cli(["list", "--json"]);
    expect(result.code).toBe(0);
    expect(json(z.array(todoSchema), result.stdout)).toEqual([tuna, nap]);
  });

  test("marks a todo done", async () => {
    const result = await cli(["done", tuna.id, "--json"]);
    expect(result.code).toBe(0);
    expect(json(todoSchema, result.stdout)).toMatchObject({
      id: tuna.id,
      done: true,
    });
    const open = await cli(["list", "--status", "open", "--json"]);
    expect(json(z.array(todoSchema), open.stdout)).toEqual([nap]);
  });

  test("deletes a todo only with --yes", async () => {
    const refused = await cli(["delete", nap.id, "--json"]);
    expect(refused.code).toBe(2);
    expect(errorCode(refused)).toBe("confirmation-required");

    const deleted = await cli(["delete", nap.id, "--yes", "--json"]);
    expect(deleted.code).toBe(0);
    expect(JSON.parse(deleted.stdout)).toEqual({ id: nap.id, deleted: true });

    const gone = await cli(["done", nap.id, "--json"]);
    expect(gone.code).toBe(4);
    expect(errorCode(gone)).toBe("todo-not-found");
  });

  test("logs out, revoking the session on the server", async () => {
    const result = await cli(["logout", "--json"]);
    expect(result.code).toBe(0);
    expect(await storedToken()).toBeUndefined();
    const response = await fetch(`${baseUrl}/api/todos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
  });

  test("whoami fails with exit code 3 after logout", async () => {
    const result = await cli(["whoami"]);
    expect(result.code).toBe(3);
    expect(result.stderr).toMatch(/\(unauthorized\)$/m);
  });

  test("never prints the token", () => {
    for (const output of outputs) expect(output).not.toContain(token);
  });
});
