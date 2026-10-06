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
let service: typeof import("@/lib/todo-service");
let handler: typeof import("./runtime").handler;

const REPLY = "Mrrp. Fine, I'll look at your list.";
const COMMENT = "Added. Don't expect gratitude.";
const PROGRESS = "Show my progress";

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function textTurn(text: string) {
  return [
    { type: "text-start", id: "reply" } as const,
    { type: "text-delta", id: "reply", delta: text } as const,
    { type: "text-end", id: "reply" } as const,
    {
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
      usage,
    } as const,
  ];
}

function toolTurn(toolName: string, input: unknown) {
  return [
    {
      type: "tool-call",
      toolCallId: `call-${crypto.randomUUID()}`,
      toolName,
      input: JSON.stringify(input),
    } as const,
    {
      type: "finish",
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      usage,
    } as const,
  ];
}

// Stands in for OpenRouter, and the calls are counted. "Add <title>" makes Lissie call addTodo,
// "Show my progress" showProgress, and once the tool has answered she comments with COMMENT;
// anything else gets REPLY.
const model = new MockLanguageModelV3({
  doStream: async ({ prompt }) => {
    const last = prompt.at(-1);
    const text =
      last?.role === "user"
        ? last.content.flatMap((p) => (p.type === "text" ? [p.text] : []))
        : [];
    const title = text.join("").match(/^Add (.+)$/)?.[1];
    const turn =
      last?.role === "tool"
        ? textTurn(COMMENT)
        : title
          ? toolTurn("addTodo", { title })
          : text.join("") === PROGRESS
            ? toolTurn("showProgress", {})
            : textTurn(REPLY);
    return {
      stream: simulateReadableStream({
        chunks: [{ type: "stream-start", warnings: [] } as const, ...turn],
      }),
    };
  },
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
  service = await import("@/lib/todo-service");
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
type Event = BaseEvent & {
  delta?: string;
  messages?: Message[];
  toolCallName?: string;
  toolCallId?: string;
  messageId?: string;
  activityType?: string;
  content?: unknown;
};

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

function textOf(events: Event[]): string {
  return events
    .filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT)
    .map((e) => e.delta)
    .join("");
}

async function memory() {
  const memory = await lissie.lissie.getMemory();
  if (!memory) throw new Error("Lissie has no memory configured");
  return memory;
}

async function storedMessages(user: User, threadId = user.thread) {
  const { messages } = await (await memory()).recall({
    threadId,
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
    expect(textOf(await eventsOf(response))).toBe(REPLY);

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

describe("a new conversation", () => {
  let owner: User;
  let stranger: User;
  let fresh: string;

  beforeAll(async () => {
    owner = await signUp();
    stranger = await signUp();
  });

  test("before any conversation, the current one is the user's first thread", async () => {
    expect(await lissie.currentLissieThreadId(owner.id)).toBe(owner.thread);
  });

  test("starting one makes a fresh thread of the user's the current one", async () => {
    expect((await run(owner)).status).toBe(200);
    fresh = await lissie.startLissieThread(owner.id);
    expect(fresh).not.toBe(owner.thread);
    expect(lissie.lissieThreadUser(fresh)).toBe(owner.id);
    expect(await lissie.currentLissieThreadId(owner.id)).toBe(fresh);
    expect(await lissie.currentLissieThreadId(stranger.id)).toBe(
      stranger.thread,
    );
  });

  test("it starts empty, takes runs, and leaves the earlier conversation alone", async () => {
    ɵGLOBAL_STORE.clear();
    expect(await eventsOf(await connect(owner, fresh))).toEqual([]);

    const response = await run(owner, fresh);
    expect(response.status).toBe(200);
    expect(textOf(await eventsOf(response))).toBe(REPLY);
    expect(await storedMessages(owner, fresh)).toHaveLength(2);
    expect(await storedMessages(owner)).toHaveLength(2);
    expect((await stop(owner, fresh)).status).toBe(200);
  });

  test("another user can't run, connect to or stop it", async () => {
    const calls = model.doStreamCalls.length;
    expect((await run(stranger, fresh)).status).toBe(404);
    expect((await connect(stranger, fresh)).status).toBe(404);
    expect((await stop(stranger, fresh)).status).toBe(404);
    expect(model.doStreamCalls).toHaveLength(calls);
  });

  test("a thread id names its user only with a UUID suffix", () => {
    expect(lissie.lissieThreadUser(owner.thread)).toBe(owner.id);
    expect(lissie.lissieThreadUser(`${owner.thread}-2`)).toBe(`${owner.id}-2`);
    expect(lissie.lissieThreadUser(`${fresh}-x`)).not.toBe(owner.id);
    expect(lissie.lissieThreadUser("lissie-")).toBeNull();
    expect(lissie.lissieThreadUser(owner.id)).toBeNull();
  });
});

describe("Lissie's tools", () => {
  let owner: User;
  let stranger: User;
  let replayed: Message[];

  beforeAll(async () => {
    owner = await signUp();
    stranger = await signUp();
  });

  test("a run adds the todo for the session's user and streams the call and its result", async () => {
    const response = await call(
      "POST",
      "/agent/lissie/run",
      owner,
      runInput(owner.thread, "Add buy milk"),
    );
    expect(response.status).toBe(200);
    const events = await eventsOf(response);
    expect(
      events.find((e) => e.type === EventType.TOOL_CALL_START),
    ).toMatchObject({ toolCallName: "addTodo" });
    const result = events.find((e) => e.type === EventType.TOOL_CALL_RESULT);
    expect(JSON.parse(String(result?.content))).toMatchObject({
      title: "buy milk",
      done: false,
    });
    expect(textOf(events)).toBe(COMMENT);

    expect(await service.listTodos(owner.id)).toMatchObject([
      { title: "buy milk" },
    ]);
    expect(await service.listTodos(stranger.id)).toEqual([]);
  });

  test("a connect after a restart replays the tool call and its result", async () => {
    ɵGLOBAL_STORE.clear();
    const response = await connect(owner);
    const messages = snapshotOf(await eventsOf(response)) ?? [];
    expect(messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    const [, call, result, comment] = messages;
    expect(call).toMatchObject({
      toolCalls: [
        {
          type: "function",
          function: {
            name: "addTodo",
            arguments: JSON.stringify({ title: "buy milk" }),
          },
        },
      ],
    });
    const toolCallId =
      call?.role === "assistant" ? call.toolCalls?.[0]?.id : undefined;
    expect(result).toMatchObject({ role: "tool", toolCallId });
    expect(JSON.parse(String(result?.content))).toMatchObject({
      title: "buy milk",
    });
    expect(comment?.content).toBe(COMMENT);
    replayed = messages;
  });

  test("a run after the replay stores only the new turn and calls no tool again", async () => {
    const before = await storedMessages(owner);
    const input = runInput(owner.thread);
    const response = await call("POST", "/agent/lissie/run", owner, {
      ...input,
      messages: [...replayed, ...input.messages],
    });
    expect(textOf(await eventsOf(response))).toBe(REPLY);

    const after = await storedMessages(owner);
    expect(after.map((m) => [m.id, m.role])).toEqual([
      ...before.map((m) => [m.id, m.role]),
      [expect.any(String), "user"],
      [expect.any(String), "assistant"],
    ]);
    expect(after.slice(0, before.length).map((m) => m.content.parts)).toEqual(
      before.map((m) => m.content.parts),
    );
    expect(await service.listTodos(owner.id)).toHaveLength(1);
  });
});

describe("Lissie's progress card", () => {
  let owner: User;
  let toolCallId: string | undefined;
  let replayed: Message[];

  beforeAll(async () => {
    owner = await signUp();
    const milk = await service.addTodo(owner.id, { title: "Buy milk" });
    await service.addTodo(owner.id, { title: "Buy tuna" });
    await service.updateTodo(owner.id, milk.id, { done: true });
  });

  const operationsOf = (content: unknown) =>
    (content as { a2ui_operations?: { updateDataModel?: unknown }[] })
      ?.a2ui_operations;

  test("a run turns showProgress's result into an A2UI card for the chat", async () => {
    const response = await call(
      "POST",
      "/agent/lissie/run",
      owner,
      runInput(owner.thread, PROGRESS),
    );
    expect(response.status).toBe(200);
    const events = await eventsOf(response);
    const result = events.find((e) => e.type === EventType.TOOL_CALL_RESULT);
    toolCallId = result?.toolCallId;
    const card = events.find((e) => e.type === EventType.ACTIVITY_SNAPSHOT);
    expect(card).toMatchObject({
      messageId: `a2ui-surface-${toolCallId}`,
      activityType: "a2ui-surface",
    });
    expect(operationsOf(card?.content)).toEqual(
      operationsOf(JSON.parse(String(result?.content))),
    );
    expect(
      operationsOf(card?.content)?.find((op) => op.updateDataModel),
    ).toMatchObject({
      updateDataModel: { value: { total: 2, done: 1, open: 1 } },
    });
    expect(textOf(events)).toBe(COMMENT);
  });

  test("a connect after a restart replays the card where the run showed it", async () => {
    ɵGLOBAL_STORE.clear();
    const messages = snapshotOf(await eventsOf(await connect(owner))) ?? [];
    expect(messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "activity",
      "assistant",
    ]);
    expect(messages[3]).toMatchObject({
      id: `a2ui-surface-${toolCallId}`,
      activityType: "a2ui-surface",
      content: {
        a2ui_operations: expect.arrayContaining([
          expect.objectContaining({
            updateDataModel: expect.objectContaining({
              value: { total: 2, done: 1, open: 1 },
            }),
          }),
        ]),
      },
    });
    replayed = messages;
  });

  test("a run after the replay stores only the new turn", async () => {
    const before = await storedMessages(owner);
    const input = runInput(owner.thread);
    const response = await call("POST", "/agent/lissie/run", owner, {
      ...input,
      messages: [...replayed, ...input.messages],
    });
    expect(textOf(await eventsOf(response))).toBe(REPLY);
    const after = await storedMessages(owner);
    expect(after.map((m) => m.role)).toEqual([
      ...before.map((m) => m.role),
      "user",
      "assistant",
    ]);
  });

  test("the model is never offered a tool that generates UI, even when the client asks", async () => {
    const calls = model.doStreamCalls.length;
    const input = runInput(owner.thread);
    const response = await call("POST", "/agent/lissie/run", owner, {
      ...input,
      forwardedProps: { a2uiCatalogAvailable: true, injectA2UITool: true },
    });
    expect(response.status).toBe(200);
    await response.text();
    const offered = model.doStreamCalls
      .slice(calls)
      .flatMap((c) => c.tools ?? [])
      .map((tool) => tool.name);
    expect(new Set(offered)).toEqual(
      new Set(["listTodos", "addTodo", "setTodoDone", "showProgress"]),
    );
  });
});
