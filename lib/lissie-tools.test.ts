import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RequestContext } from "@mastra/core/request-context";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

let dir: string;
let db: typeof import("./db").db;
let schema: typeof import("./schema");
let service: typeof import("./todo-service");
let tools: typeof import("./lissie-tools");

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "todo-cat-lissie-tools-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  // Imported after DATABASE_URL is set, because lib/db.ts reads it on load.
  ({ db } = await import("./db"));
  await migrate(db, { migrationsFolder: "drizzle" });
  schema = await import("./schema");
  service = await import("./todo-service");
  tools = await import("./lissie-tools");
});

afterAll(async () => {
  db?.$client.close();
  await rm(dir, { recursive: true, force: true });
});

// Every test gets two fresh users: the one Lissie works for and someone she must never reach.
async function twoUsers(): Promise<[string, string]> {
  const ids: [string, string] = [crypto.randomUUID(), crypto.randomUUID()];
  await db
    .insert(schema.user)
    .values(ids.map((id) => ({ id, name: id, email: `${id}@example.com` })));
  return ids;
}

// Runs a tool the way Mastra does in a run, with the request context the runtime builds.
// Input and context go in untyped, because the model's input may be anything.
function run(
  name: keyof typeof tools.lissieTools,
  input: unknown,
  requestContext: unknown,
) {
  return tools.lissieTools[name].execute?.(
    input as never,
    { requestContext } as never,
  );
}

const as = (userId: string) => tools.lissieRequestContext(userId);

describe("addTodo", () => {
  test("adds the todo to the request context's user only", async () => {
    const [alice, bob] = await twoUsers();
    const todo = await run("addTodo", { title: "Buy milk" }, as(alice));

    expect(todo).toMatchObject({ title: "Buy milk", done: false });
    expect(await service.listTodos(alice)).toEqual([todo]);
    expect(await service.listTodos(bob)).toEqual([]);
  });

  test("ignores no user id from the model: an owner field fails validation", async () => {
    const [alice, bob] = await twoUsers();
    const result = await run(
      "addTodo",
      { title: "Buy milk", userId: bob },
      as(alice),
    );

    expect(result).toMatchObject({ error: true });
    expect(await service.listTodos(alice)).toEqual([]);
    expect(await service.listTodos(bob)).toEqual([]);
  });

  test("does nothing without a user in the request context", async () => {
    const [alice] = await twoUsers();
    const result = await run(
      "addTodo",
      { title: "Buy milk" },
      new RequestContext(),
    );

    expect(result).toMatchObject({ error: true });
    expect(await service.listTodos(alice)).toEqual([]);
  });
});

describe("listTodos", () => {
  test("lists only the request context's user's todos, filtered", async () => {
    const [alice, bob] = await twoUsers();
    const milk = await service.addTodo(alice, { title: "Buy milk" });
    const tuna = await service.addTodo(alice, { title: "Buy tuna" });
    await service.updateTodo(alice, tuna.id, { done: true });
    await service.addTodo(bob, { title: "Buy milk for Bob" });

    const all = await run("listTodos", {}, as(alice));
    expect(all).toMatchObject({
      todos: [{ title: "Buy milk" }, { title: "Buy tuna", done: true }],
    });
    expect(
      await run("listTodos", { status: "open", search: "MILK" }, as(alice)),
    ).toEqual({ todos: [milk] });
    expect(await run("listTodos", {}, as(bob))).toMatchObject({
      todos: [{ title: "Buy milk for Bob" }],
    });
  });
});

describe("setTodoDone", () => {
  test("marks the user's todo done and reopens it", async () => {
    const [alice] = await twoUsers();
    const feed = await service.addTodo(alice, { title: "Feed the cat" });

    const done = await run(
      "setTodoDone",
      { id: feed.id, done: true },
      as(alice),
    );
    expect(done).toMatchObject({ id: feed.id, done: true });
    expect(await service.getTodo(alice, feed.id)).toEqual(done);

    const reopened = await run(
      "setTodoDone",
      { id: feed.id, done: false },
      as(alice),
    );
    expect(reopened).toMatchObject({ done: false, completedAt: null });
  });

  test("another user's todo is not found and stays as it is", async () => {
    const [alice, bob] = await twoUsers();
    const feed = await service.addTodo(alice, { title: "Feed the cat" });

    const result = await run(
      "setTodoDone",
      { id: feed.id, done: true },
      as(bob),
    );
    expect(result).toEqual({
      error: {
        code: "todo-not-found",
        message: `No todo with id ${feed.id}`,
      },
    });
    expect(await service.getTodo(alice, feed.id)).toEqual(feed);
  });
});
