// The shapes the server and its clients agree on (see tech-docs/architecture.md).
// Adapters parse every input with these schemas; the CLI parses every response with them.
import { z } from "zod";

/** A calendar date without time, `yyyy-mm-dd`; never turned into a `Date` (see tech-docs/architecture.md). */
export const dueDateSchema = z.iso.date();

export const todoTitleSchema = z.string().trim().min(1).max(500);

export const todoSchema = z.object({
  id: z.string(),
  title: z.string(),
  dueDate: dueDateSchema.nullable(),
  done: z.boolean(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type Todo = z.infer<typeof todoSchema>;

export const newTodoSchema = z.strictObject({
  title: todoTitleSchema,
  dueDate: dueDateSchema.nullable().optional(),
});
export type NewTodo = z.infer<typeof newTodoSchema>;

/** A partial update; `dueDate: null` clears the due date, a missing field stays as it is. */
export const todoChangesSchema = z
  .strictObject({
    title: todoTitleSchema.optional(),
    dueDate: dueDateSchema.nullable().optional(),
    done: z.boolean().optional(),
  })
  .refine((changes) => Object.values(changes).some((v) => v !== undefined), {
    message: "Change at least one of title, dueDate or done",
  });
export type TodoChanges = z.infer<typeof todoChangesSchema>;

export const todoStatusSchema = z.enum(["open", "done", "all"]);
export type TodoStatus = z.infer<typeof todoStatusSchema>;

export const todoFilterSchema = z.strictObject({
  status: todoStatusSchema.default("all"),
  /** Case-insensitive substring of the title; empty means no text filter. */
  search: z.string().trim().optional(),
});
export type TodoFilter = z.infer<typeof todoFilterSchema>;

export const errorCodeSchema = z.enum([
  "unauthorized",
  "todo-not-found",
  "validation-failed",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorBodySchema = z.object({
  error: z.object({ code: errorCodeSchema, message: z.string() }),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;
