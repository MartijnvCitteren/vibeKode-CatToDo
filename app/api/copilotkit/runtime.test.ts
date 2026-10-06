import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BaseEvent, EventType, type Message } from "@ag-ui/client";
import { ɵGLOBAL_STORE } from "@copilotkit/runtime/v2";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

let dir: string;
let db: typeof import("@/lib/db").db;
let auth: typeof import("@/lib/auth").auth;
let lissie: typeof import("@/lib/lissie");
let handler: typeof import("./runtime").handler;

const REPLY = "Mrrp. Fine, I'll look at your list.";

// Stands in for OpenRouter: every run answers with REPLY, and the calls are counted.
const model = new MockLanguageModelV3({
  doStream: async () => ({
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "reply" },
        { type: "text-delta", id: "reply", delta: REPLY },
        { type: "text-end", id: "reply" },
        {
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
        },
      ],
    }),
  }),
});

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "todo-cat-copilotkit-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-characters";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  // Imported after the env is set, because lib/db.ts and Better Auth read it on load.
  ({ db } = await import("@/lib/db"));
  await migrate(db, { migrationsFolder: "drizzle" });
  ({ auth } = await import("@/lib/auth"));
  lissie = await import("@/lib/lissie");
  ({ handler } = await import("./runtime"));
  lissie.lissie.__updateModel({ model });
});

afterAll(async () => {
  db?.$client.close();
  await rm(dir, { recursive: true, force: true });
});

type User = { id: string; token: string; thread: string };

// Signs up a fresh user and returns the bearer token sign-in hands out.
async function signUp(): Promise<User> {
  const credentials = {
    email: `${crypto.randomUUID()}@example.com`,
    password: "scratching-post",
  };
  const { user } = await auth.api.signUpEmail({
    body: { name: "Human", ...credentials },
  });
  const { headers } = await auth.api.signInEmail({
    body: credentials,
    returnHeaders: true,
  });
  const token = headers.get("set-auth-token");
  if (!token) throw new Error("Sign-in returned no bearer token");
  return { id: user.id, token, thread: lissie.lissieThreadId(user.id) };
}

function call(
  method: string,
  path: string,
  user?: User | string,
  body?: unknown,
): Promise<Response> {
  const headers = new Headers();
  const token = typeof user === "string" ? user : user?.token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return handler(
    new Request(`http://localhost:3000/api/copilotkit${path}`, {
      method,
      headers,
      // A string goes out as is, so tests can send a body that isn't JSON.
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

// An AG-UI run input with one new user message, as the chat sends it.
function runInput(threadId: string, text = "What is on my list?") {
  const messages: Message[] = [
    { id: crypto.randomUUID(), role: "user", content: text },
  ];
  return {
    threadId,
    runId: crypto.randomUUID(),
    messages,
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
}

const run = (user: User, threadId = user.thread) =>
  call("POST", "/agent/lissie/run", user, runInput(threadId));
const connect = (user: User, threadId = user.thread) =>
  call("POST", "/agent/lissie/connect", user, runInput(threadId));
const stop = (user: User, threadId = user.thread) =>
  call("POST", `/agent/lissie/stop/${threadId}`, user, {});

// The fields these tests read from AG-UI events.
type Event = BaseEvent & { delta?: string; messages?: Message[] };

/** The AG-UI events of a server-sent event stream. */
async function eventsOf(response: Response): Promise<Event[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice("data: ".length)));
}

function snapshotOf(events: Event[]): Message[] | undefined {
  return events.find((e) => e.type === EventType.MESSAGES_SNAPSHOT)?.messages;
}

async function memory() {
  const memory = await lissie.lissie.getMemory();
  if (!memory) throw new Error("Lissie has no memory configured");
  return memory;
}

async function storedMessages(user: User) {
  const { messages } = await (await memory()).recall({
    threadId: user.thread,
    perPage: false,
  });
  return messages;
}

// Every route the runtime serves in multi-route mode, plus an unknown one and a single-route envelope.
const routes: [string, string, unknown?][] = [
  ["GET", "/info"],
  ["POST", "/agent/lissie/run", runInput("lissie-anyone")],
  ["POST", "/agent/lissie/connect", runInput("lissie-anyone")],
  ["POST", "/agent/lissie/stop/lissie-anyone", {}],
  ["POST", "/agent/lissie/suggest", runInput("lissie-anyone")],
  ["POST", "/trajectory/some-trajectory/connect", {}],
  ["GET", "/inspector-metadata"],
  ["GET", "/inspector-learning"],
  ["POST", "/transcribe", {}],
  ["GET", "/cpk-debug-events"],
  ["GET", "/threads"],
  ["POST", "/threads/subscribe", {}],
  ["POST", "/threads/clear", {}],
  ["GET", "/threads/lissie-anyone/messages"],
  ["GET", "/threads/lissie-anyone/events"],
  ["GET", "/threads/lissie-anyone/state"],
  ["POST", "/threads/lissie-anyone/archive", {}],
  ["PATCH", "/threads/lissie-anyone", { name: "Mine now" }],
  ["DELETE", "/threads/lissie-anyone"],
  ["GET", "/memories"],
  ["POST", "/memories/recall", {}],
  ["POST", "/memories/subscribe", {}],
  ["PATCH", "/memories/some-memory", {}],
  ["POST", "/annotate", {}],
  ["GET", "/no-such-route"],
  ["POST", "", { method: "agent/run", params: { agentId: "lissie" } }],
];

describe("without a session", () => {
  for (const [method, path, body] of routes) {
    test(`${method} ${path || "/"} answers 401`, async () => {
      const response = await call(method, path, undefined, body);
      expect(response.status).toBe(401);
    });

    test(`${method} ${path || "/"} answers 401 with an invalid token`, async () => {
      const response = await call(method, path, "not-a-session", body);
      expect(response.status).toBe(401);
    });
  }

  test("never reaches the model", () => {
    expect(model.doStreamCalls).toHaveLength(0);
  });
});

describe("with a session", () => {
  const allowed = new Set([
    "GET /info",
    "POST /agent/lissie/run",
    "POST /agent/lissie/connect",
    "POST /agent/lissie/stop/lissie-anyone",
  ]);

  for (const [method, path, body] of routes) {
    if (allowed.has(`${method} ${path}`)) continue;
    test(`${method} ${path || "/"} is not served`, async () => {
      const response = await call(method, path, await signUp(), body);
      expect(response.status).toBe(404);
    });
  }

  test("GET /info lists Lissie", async () => {
    const response = await call("GET", "/info", await signUp());
    expect(response.status).toBe(200);
    expect(Object.keys((await response.json()).agents)).toEqual(["lissie"]);
  });

  test("a run, connect or stop without the caller's thread id is not served", async () => {
    const user = await signUp();
    const path = "/agent/lissie/run";
    expect((await call("POST", path, user, "not json")).status).toBe(404);
    expect((await call("POST", path, user, {})).status).toBe(404);
    expect((await run(user, "some-other-thread")).status).toBe(404);
    expect((await connect(user, `${user.thread}-2`)).status).toBe(404);
    expect((await stop(user, `${user.thread}-2`)).status).toBe(404);
  });
});

describe("a user's conversation with Lissie", () => {
  let owner: User;
  let stranger: User;

  beforeAll(async () => {
    owner = await signUp();
    stranger = await signUp();
  });

  test("a run streams Lissie's reply and stores both messages under the user", async () => {
    const response = await run(owner);
    expect(response.status).toBe(200);
    const events = await eventsOf(response);
    const text = events
      .filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((e) => e.delta)
      .join("");
    expect(text).toBe(REPLY);

    const thread = await (await memory()).getThreadById({
      threadId: owner.thread,
    });
    expect(thread?.resourceId).toBe(owner.id);
    const stored = await storedMessages(owner);
    expect(stored.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(stored.every((m) => m.resourceId === owner.id)).toBe(true);
  });

  test("a connect after a restart replays the conversation from Mastra memory", async () => {
    // The runtime's in-memory store is what a restart loses.
    ɵGLOBAL_STORE.clear();
    const response = await connect(owner);
    expect(response.status).toBe(200);
    const messages = snapshotOf(await eventsOf(response));
    expect(messages?.map((m) => [m.role, m.content])).toEqual([
      ["user", "What is on my list?"],
      ["assistant", REPLY],
    ]);
  });

  test("the user can stop their own thread", async () => {
    expect((await stop(owner)).status).toBe(200);
  });

  test("another user can't run on the thread", async () => {
    const calls = model.doStreamCalls.length;
    const response = await run(stranger, owner.thread);
    expect(response.status).toBe(404);
    expect(model.doStreamCalls).toHaveLength(calls);
    expect(await storedMessages(owner)).toHaveLength(2);
  });

  test("another user can't read or reconnect to the thread", async () => {
    expect((await connect(stranger, owner.thread)).status).toBe(404);
    const path = `/threads/${owner.thread}`;
    for (const route of ["messages", "events", "state"]) {
      expect((await call("GET", `${path}/${route}`, stranger)).status).toBe(
        404,
      );
    }
  });

  test("another user can't stop the thread", async () => {
    expect((await stop(stranger, owner.thread)).status).toBe(404);
  });

  test("another user's own thread starts empty", async () => {
    const response = await connect(stranger);
    expect(response.status).toBe(200);
    expect(await eventsOf(response)).toEqual([]);
  });

  test("history reads only what Mastra stored under the thread's own user", async () => {
    const store = await memory();
    const plant = (threadId: string, resourceId: string) =>
      store.saveMessages({
        messages: [
          {
            id: crypto.randomUUID(),
            role: "user",
            threadId,
            resourceId,
            createdAt: new Date(),
            content: { format: 2, parts: [{ type: "text", text: "Planted" }] },
          },
        ],
      });

    // The stranger's thread, holding a message stored under the owner.
    await store.createThread({
      threadId: stranger.thread,
      resourceId: stranger.id,
    });
    await plant(stranger.thread, owner.id);
    expect(await lissie.lissieHistory(stranger.thread)).toEqual([]);

    // A Lissie thread id that Mastra holds for someone else.
    const third = await signUp();
    await store.createThread({
      threadId: third.thread,
      resourceId: owner.id,
    });
    await plant(third.thread, owner.id);
    expect(await lissie.lissieHistory(third.thread)).toEqual([]);

    expect(await lissie.lissieHistory("not-a-lissie-thread")).toEqual([]);
  });
});
