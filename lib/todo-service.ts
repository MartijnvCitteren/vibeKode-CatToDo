import "server-only";
import type {
  ErrorCode,
  NewTodo,
  Todo,
  TodoChanges,
  TodoFilter,
} from "@todo-cat/contract";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { todos } from "./schema";

// The todo use cases and the only module that touches the todos table (see tech-docs/architecture.md).
// Every function takes the owner's user id first, and every query filters by it.

export type TodoErrorCode = Extract<
  ErrorCode,
  "todo-not-found" | "validation-failed"
>;

/**
 * A rule violation with a stable code that adapters map to their protocol.
 * The service throws `todo-not-found`; adapters throw `validation-failed` when a contract schema rejects input.
 */
export class TodoError extends Error {
  constructor(
    readonly code: TodoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TodoError";
  }
}

type TodoRow = typeof todos.$inferSelect;

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.dueDate,
    done: row.done,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

// Another user's todo looks exactly like a missing one, so ids never leak across users.
function notFound(id: string): TodoError {
  return new TodoError("todo-not-found", `No todo with id ${id}`);
}

function ownedBy(userId: string, id: string) {
  return and(eq(todos.userId, userId), eq(todos.id, id));
}

/** Open todos first, then by due date (undated last), then oldest first. */
export async function listTodos(
  userId: string,
  filter: TodoFilter = { status: "all" },
): Promise<Todo[]> {
  const search = filter.search?.trim();
  const rows = await db
    .select()
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        filter.status === "all"
          ? undefined
          : eq(todos.done, filter.status === "done"),
        // instr instead of LIKE, so % and _ in the search text match literally.
        search
          ? sql`instr(lower(${todos.title}), lower(${search})) > 0`
          : undefined,
      ),
    )
    .orderBy(
      asc(todos.done),
      sql`${todos.dueDate} is null`,
      asc(todos.dueDate),
      asc(todos.createdAt),
      asc(todos.id),
    );
  return rows.map(toTodo);
}

export async function getTodo(userId: string, id: string): Promise<Todo> {
  const [row] = await db.select().from(todos).where(ownedBy(userId, id));
  if (!row) throw notFound(id);
  return toTodo(row);
}

/** `now` is the creation time; callers other than the dev seed leave it out. */
export async function addTodo(
  userId: string,
  input: NewTodo,
  now = new Date(),
): Promise<Todo> {
  const [row] = await db
    .insert(todos)
    .values({
      id: crypto.randomUUID(),
      userId,
      title: input.title,
      dueDate: input.dueDate ?? null,
      done: false,
      createdAt: now,
      completedAt: null,
    })
    .returning();
  return toTodo(row);
}

/**
 * Applies only the fields present in `changes`. Marking a todo done stamps `completedAt`
 * with `now`, reopening clears it, and marking a done todo done again keeps the first stamp.
 */
export async function updateTodo(
  userId: string,
  id: string,
  changes: TodoChanges,
  now = new Date(),
): Promise<Todo> {
  const { title, dueDate, done } = changes;
  const values = {
    ...(title !== undefined && { title }),
    ...(dueDate !== undefined && { dueDate }),
    ...(done === true && {
      done: true,
      completedAt: sql`coalesce(${todos.completedAt}, ${now.getTime()})`,
    }),
    ...(done === false && { done: false, completedAt: null }),
  };
  // The contract rejects empty changes; a typed caller that sends none still gets the todo back.
  if (Object.keys(values).length === 0) return getTodo(userId, id);
  const [row] = await db
    .update(todos)
    .set(values)
    .where(ownedBy(userId, id))
    .returning();
  if (!row) throw notFound(id);
  return toTodo(row);
}

export async function deleteTodo(userId: string, id: string): Promise<void> {
  const [row] = await db
    .delete(todos)
    .where(ownedBy(userId, id))
    .returning({ id: todos.id });
  if (!row) throw notFound(id);
}
