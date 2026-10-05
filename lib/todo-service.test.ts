import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { todoSchema } from "@todo-cat/contract";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

let dir: string;
let db: typeof import("./db").db;
let schema: typeof import("./schema");
let service: typeof import("./todo-service");

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "todo-cat-todos-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  // Imported after DATABASE_URL is set, because lib/db.ts reads it on load.
  ({ db } = await import("./db"));
  await migrate(db, { migrationsFolder: "drizzle" });
  schema = await import("./schema");
  service = await import("./todo-service");
});

afterAll(async () => {
  db?.$client.close();
  await rm(dir, { recursive: true, force: true });
});

// Every test gets two fresh users: the owner and someone who must never reach the owner's todos.
async function twoUsers(): Promise<[string, string]> {
  const ids: [string, string] = [crypto.randomUUID(), crypto.randomUUID()];
  await db
    .insert(schema.user)
    .values(ids.map((id) => ({ id, name: id, email: `${id}@example.com` })));
  return ids;
}

const notFound = { name: "TodoError", code: "todo-not-found" };

describe("addTodo", () => {
  test("returns a contract todo that only its owner sees", async () => {
    const [alice, bob] = await twoUsers();
    const todo = await service.addTodo(alice, {
      title: "Buy tuna",
      dueDate: "2026-10-31",
    });

    expect(todoSchema.parse(todo)).toEqual(todo);
    expect(todo).toMatchObject({
      title: "Buy tuna",
      dueDate: "2026-10-31",
      done: false,
      completedAt: null,
    });
    expect(await service.listTodos(alice)).toEqual([todo]);
    expect(await service.listTodos(bob)).toEqual([]);
  });

  test("leaves the due date empty when none is given", async () => {
    const [alice] = await twoUsers();
    const todo = await service.addTodo(alice, { title: "Nap" });
    expect(todo.dueDate).toBeNull();
  });

  test("stamps the creation time", async () => {
    const [alice] = await twoUsers();
    const now = new Date("2026-09-21T08:30:00.000Z");
    const todo = await service.addTodo(alice, { title: "Stretch" }, now);
    expect(todo.createdAt).toBe("2026-09-21T08:30:00.000Z");
  });
});

describe("listTodos", () => {
  test("filters by status and lists only the owner's todos", async () => {
    const [alice, bob] = await twoUsers();
    const open = await service.addTodo(alice, { title: "Open" });
    const done = await service.updateTodo(
      alice,
      (await service.addTodo(alice, { title: "Done" })).id,
      { done: true },
    );
    await service.addTodo(bob, { title: "Bob's open" });
    await service.updateTodo(
      bob,
      (await service.addTodo(bob, { title: "Bob's done" })).id,
      { done: true },
    );

    expect(await service.listTodos(alice, { status: "open" })).toEqual([open]);
    expect(await service.listTodos(alice, { status: "done" })).toEqual([done]);
    expect(await service.listTodos(alice, { status: "all" })).toEqual([
      open,
      done,
    ]);
  });

  test("searches titles case-insensitively and literally", async () => {
    const [alice, bob] = await twoUsers();
    await service.addTodo(alice, { title: "Feed the CAT" });
    await service.addTodo(alice, { title: "100% catnip" });
    await service.addTodo(alice, { title: "Vacuum" });
    await service.addTodo(bob, { title: "Bob's cat" });

    const titles = async (search: string) =>
      (await service.listTodos(alice, { status: "all", search })).map(
        (todo) => todo.title,
      );
    expect(await titles("cat")).toEqual(["Feed the CAT", "100% catnip"]);
    expect(await titles("0% c")).toEqual(["100% catnip"]);
    expect(await titles("%")).toEqual(["100% catnip"]);
    expect(await titles("_")).toEqual([]);
    expect(await titles("  ")).toHaveLength(3);
  });

  test("orders open before done, then by due date with undated last, then oldest first", async () => {
    const [alice] = await twoUsers();
    const at = (day: number) => new Date(Date.UTC(2026, 8, day));
    const add = (title: string, dueDate: string | null, day: number) =>
      service.addTodo(alice, { title, dueDate }, at(day));
    await add("undated old", null, 1);
    await add("due late", "2026-12-01", 2);
    await add("undated new", null, 3);
    await add("due soon", "2026-10-10", 4);
    const finished = await add("done and due soonest", "2026-10-01", 5);
    await service.updateTodo(alice, finished.id, { done: true });

    expect((await service.listTodos(alice)).map((todo) => todo.title)).toEqual([
      "due soon",
      "due late",
      "undated old",
      "undated new",
      "done and due soonest",
    ]);
  });
});

describe("getTodo", () => {
  test("returns the owner's todo", async () => {
    const [alice] = await twoUsers();
    const todo = await service.addTodo(alice, { title: "Groom" });
    expect(await service.getTodo(alice, todo.id)).toEqual(todo);
  });

  test("treats another user's todo as not found", async () => {
    const [alice, bob] = await twoUsers();
    const todo = await service.addTodo(alice, { title: "Secret" });
    await expect(service.getTodo(bob, todo.id)).rejects.toMatchObject(notFound);
  });

  test("reports an unknown id as not found", async () => {
    const [alice] = await twoUsers();
    await expect(
      service.getTodo(alice, crypto.randomUUID()),
    ).rejects.toMatchObject(notFound);
  });
});

describe("updateTodo", () => {
  test("changes only the fields given", async () => {
    const [alice] = await twoUsers();
    const todo = await service.addTodo(alice, {
      title: "Old title",
      dueDate: "2026-10-12",
    });

    const renamed = await service.updateTodo(alice, todo.id, {
      title: "New title",
    });
    expect(renamed).toEqual({ ...todo, title: "New title" });

    const moved = await service.updateTodo(alice, todo.id, {
      dueDate: "2026-11-01",
    });
    expect(moved).toEqual({ ...renamed, dueDate: "2026-11-01" });

    const cleared = await service.updateTodo(alice, todo.id, {
      dueDate: null,
    });
    expect(cleared).toEqual({ ...moved, dueDate: null });
    expect(await service.getTodo(alice, todo.id)).toEqual(cleared);
  });

  test("stamps completedAt when done, keeps the first stamp, and clears it when reopened", async () => {
    const [alice] = await twoUsers();
    const todo = await service.addTodo(alice, { title: "Chase laser" });
    const first = new Date("2026-10-01T10:00:00.000Z");

    const done = await service.updateTodo(
      alice,
      todo.id,
      { done: true },
      first,
    );
    expect(done).toMatchObject({
      done: true,
      completedAt: first.toISOString(),
    });

    const doneAgain = await service.updateTodo(
      alice,
      todo.id,
      { done: true },
      new Date("2026-10-02T10:00:00.000Z"),
    );
    expect(doneAgain.completedAt).toBe(first.toISOString());

    const reopened = await service.updateTodo(alice, todo.id, { done: false });
    expect(reopened).toEqual(todo);
  });

  test("returns the todo unchanged when there is nothing to change", async () => {
    const [alice, bob] = await twoUsers();
    const todo = await service.addTodo(alice, { title: "Sit" });
    expect(await service.updateTodo(alice, todo.id, {})).toEqual(todo);
    await expect(service.updateTodo(bob, todo.id, {})).rejects.toMatchObject(
      notFound,
    );
  });

  test("treats another user's todo as not found and leaves it unchanged", async () => {
    const [alice, bob] = await twoUsers();
    const todo = await service.addTodo(alice, { title: "Mine" });
    await expect(
      service.updateTodo(bob, todo.id, {
        title: "Stolen",
        dueDate: "2026-10-06",
        done: true,
      }),
    ).rejects.toMatchObject(notFound);
    expect(await service.getTodo(alice, todo.id)).toEqual(todo);
  });
});

describe("deleteTodo", () => {
  test("deletes the owner's todo", async () => {
    const [alice] = await twoUsers();
    const todo = await service.addTodo(alice, { title: "Gone soon" });
    await service.deleteTodo(alice, todo.id);
    await expect(service.getTodo(alice, todo.id)).rejects.toMatchObject(
      notFound,
    );
    await expect(service.deleteTodo(alice, todo.id)).rejects.toMatchObject(
      notFound,
    );
  });

  test("treats another user's todo as not found and keeps it", async () => {
    const [alice, bob] = await twoUsers();
    const todo = await service.addTodo(alice, { title: "Keep" });
    await expect(service.deleteTodo(bob, todo.id)).rejects.toMatchObject(
      notFound,
    );
    expect(await service.getTodo(alice, todo.id)).toEqual(todo);
  });
});

test("deleting a user deletes their todos and nobody else's", async () => {
  const [alice, bob] = await twoUsers();
  await service.addTodo(alice, { title: "Alice's" });
  const bobs = await service.addTodo(bob, { title: "Bob's" });

  await db.delete(schema.user).where(eq(schema.user.id, alice));

  // Read the table itself: the service would hide orphaned rows behind its owner filter.
  const rows = await db
    .select({ id: schema.todos.id })
    .from(schema.todos)
    .where(eq(schema.todos.userId, alice));
  expect(rows).toEqual([]);
  expect(await service.listTodos(bob)).toEqual([bobs]);
});
