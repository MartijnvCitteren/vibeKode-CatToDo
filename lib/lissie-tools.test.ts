import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  A2uiMessageListSchema,
  BASIC_COMPONENTS,
  BASIC_FUNCTIONS,
  Catalog,
  type ComponentApi,
  ExpressionParser,
  MessageProcessor,
} from "@a2ui/web_core/v0_9";
import { RequestContext } from "@mastra/core/request-context";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { LISSIE_CATALOG_ID, lissieCatalogDefinitions } from "./lissie-catalog";

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

describe("showProgress", () => {
  // The catalog the chat renders with, without its React renderers: A2UI's own processor
  // takes the operations against it, and its component schemas check every component.
  const catalog = new Catalog<ComponentApi>(
    LISSIE_CATALOG_ID,
    [
      ...BASIC_COMPONENTS,
      ...Object.entries(lissieCatalogDefinitions).map(([name, { props }]) => ({
        name,
        schema: props,
      })),
    ],
    BASIC_FUNCTIONS,
  );

  /** Every data model path a property reads, directly or inside a formatString template. */
  function pathsIn(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(pathsIn);
    if (typeof value !== "object" || value === null) return [];
    if ("path" in value && typeof value.path === "string") return [value.path];
    if ("call" in value && value.call === "formatString") {
      const args = "args" in value ? value.args : undefined;
      const template =
        typeof args === "object" && args !== null && "value" in args
          ? String(args.value)
          : "";
      return new ExpressionParser().parse(template).flatMap(pathsIn);
    }
    return Object.values(value).flatMap(pathsIn);
  }

  /** Every number written into a property as a literal. */
  function numbersIn(value: unknown): number[] {
    if (typeof value === "number") return [value];
    if (typeof value !== "object" || value === null) return [];
    return Object.values(value).flatMap(numbersIn);
  }

  // The rows themselves, counted without the todo service the tool counts with.
  async function countRows(userId: string) {
    const rows = await db
      .select({ done: schema.todos.done })
      .from(schema.todos)
      .where(eq(schema.todos.userId, userId));
    const done = rows.filter((row) => row.done).length;
    return { total: rows.length, done, open: rows.length - done };
  }

  async function progressOf(userId: string) {
    const result = await run("showProgress", {}, as(userId));
    const operations = A2uiMessageListSchema.parse(
      (result as { a2ui_operations: unknown }).a2ui_operations,
    );
    const processor = new MessageProcessor([catalog]);
    processor.processMessages(operations);
    const [surface, ...others] = processor.model.surfacesMap.values();
    expect(others).toEqual([]);
    if (!surface) throw new Error("The operations created no surface");
    return surface;
  }

  test("draws a well-formed A2UI card on the catalog the chat renders", async () => {
    const [alice] = await twoUsers();
    await service.addTodo(alice, { title: "Buy milk" });
    const surface = await progressOf(alice);
    expect(surface.catalog.id).toBe(LISSIE_CATALOG_ID);

    const components = new Map(surface.componentsModel.entries);
    const reached = new Set<string>();
    const visit = (id: string) => {
      const component = components.get(id);
      expect(component, `component ${id}`).toBeDefined();
      if (!component || reached.has(id)) return;
      reached.add(id);
      const api = catalog.components.get(component.type);
      expect(api, `catalog component ${component.type}`).toBeDefined();
      expect(api?.schema.safeParse(component.properties).error).toBeUndefined();
      const { child, children } = component.properties;
      for (const next of [child, children].flat()) {
        if (typeof next === "string") visit(next);
      }
    };
    visit("root");
    expect([...reached].sort()).toEqual([...components.keys()].sort());
  });

  test("binds the numbers from the data model, which match the user's rows", async () => {
    const [alice, bob] = await twoUsers();
    const milk = await service.addTodo(alice, { title: "Buy milk" });
    await service.addTodo(alice, { title: "Buy tuna" });
    await service.addTodo(alice, { title: "Feed the cat" });
    await service.updateTodo(alice, milk.id, { done: true });
    await service.addTodo(bob, { title: "Bob's own todo" });

    const surface = await progressOf(alice);
    const rows = await countRows(alice);
    expect(rows).toEqual({ total: 3, done: 1, open: 2 });
    expect(surface.dataModel.get("/")).toEqual(rows);

    // No number is written into the tree: each one the card shows is read from the data model.
    const components = [...surface.componentsModel.entries].map(
      ([, component]) => component.properties,
    );
    expect(components.flatMap(numbersIn)).toEqual([]);
    const paths = new Set(components.flatMap(pathsIn));
    expect([...paths].sort()).toEqual(["/done", "/open", "/total"]);
    for (const path of paths) {
      expect(typeof surface.dataModel.get(path)).toBe("number");
    }
  });

  test("counts an empty list as nothing to do", async () => {
    const [alice] = await twoUsers();
    const surface = await progressOf(alice);
    expect(surface.dataModel.get("/")).toEqual({ total: 0, done: 0, open: 0 });
  });

  test("does nothing without a user in the request context", async () => {
    const result = await run("showProgress", {}, new RequestContext());
    expect(result).toMatchObject({ error: true });
  });
});
