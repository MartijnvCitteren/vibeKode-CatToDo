import { errorBodySchema, todoSchema } from "@todo-cat/contract";
import { z } from "zod";

// What the chat shows for each of Lissie's tool calls: one readable line, never raw JSON
// (see tech-docs/agent.md). Shared by the browser and the tests, so it holds no server code.

/** Lissie's tool names; the agent registers its tools under these keys (lib/lissie-tools.ts). */
export const LISSIE_TOOLS = {
  listTodos: "listTodos",
  addTodo: "addTodo",
  setTodoDone: "setTodoDone",
  showProgress: "showProgress",
} as const;

/** The tools that change the list, after which the browser reloads the sidebar. */
export const LISSIE_WRITE_TOOLS: ReadonlySet<string> = new Set([
  LISSIE_TOOLS.addTodo,
  LISSIE_TOOLS.setTodoDone,
]);

// Lenient on purpose: the chat renders a call while its arguments still stream in.
export const listTodosArgs = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
});
export const addTodoArgs = z.object({
  title: z.string().optional(),
  dueDate: z.string().nullable().optional(),
});
export const setTodoDoneArgs = z.object({
  id: z.string().optional(),
  done: z.boolean().optional(),
});

const listResult = z.object({ todos: z.array(todoSchema) });
const todoResult = z.union([todoSchema, errorBodySchema]);

/** A tool result as the chat receives it: the tool's return value as a JSON string. */
function parseResult<T extends z.ZodType>(
  schema: T,
  result: string,
): z.infer<T> | undefined {
  try {
    const parsed = schema.safeParse(JSON.parse(result));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

const quoted = (title: string) => `“${title}”`;

export function listTodosLine(
  args: z.infer<typeof listTodosArgs>,
  result?: string,
): string {
  const search = args.search?.trim();
  if (result === undefined) return "Looking at your list…";
  const parsed = parseResult(listResult, result);
  if (!parsed) return "Tried to look at your list, and failed";
  const open = parsed.todos.filter((todo) => !todo.done).length;
  const done = parsed.todos.length - open;
  const found =
    parsed.todos.length === 0
      ? "nothing"
      : [open && `${open} open`, done && `${done} done`]
          .filter(Boolean)
          .join(", ");
  return search
    ? `Searched your list for ${quoted(search)}: ${found}`
    : `Looked at your list: ${found}`;
}

export function addTodoLine(
  args: z.infer<typeof addTodoArgs>,
  result?: string,
): string {
  if (result === undefined) {
    return args.title ? `Adding ${quoted(args.title)}…` : "Adding a todo…";
  }
  const todo = parseResult(todoResult, result);
  if (!todo || "error" in todo) return "Tried to add a todo, and failed";
  const due = todo.dueDate ? `, due ${todo.dueDate}` : "";
  return `Added ${quoted(todo.title)}${due}`;
}

export function setTodoDoneLine(
  args: z.infer<typeof setTodoDoneArgs>,
  result?: string,
): string {
  const reopen = args.done === false;
  if (result === undefined) {
    return reopen ? "Reopening a todo…" : "Marking a todo done…";
  }
  const todo = parseResult(todoResult, result);
  if (!todo) return "Tried to change a todo, and failed";
  if ("error" in todo) return "Couldn't find that todo";
  return todo.done
    ? `Marked ${quoted(todo.title)} done`
    : `Reopened ${quoted(todo.title)}`;
}
