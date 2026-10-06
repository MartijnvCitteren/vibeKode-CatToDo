import "server-only";
import { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import {
  type ErrorBody,
  errorBodySchema,
  newTodoSchema,
  todoFilterSchema,
  todoSchema,
} from "@todo-cat/contract";
import { z } from "zod";
import { progressCard } from "./lissie-progress";
import { LISSIE_TOOLS } from "./lissie-tool-calls";
import { addTodo, listTodos, TodoError, updateTodo } from "./todo-service";

// Lissie's tools: the agent adapter on the todo service (see tech-docs/architecture.md).
// The owner never comes from the model: no tool takes a user id, and each reads it from the
// request context, which only the server sets, from the session (app/api/copilotkit/runtime.ts).

/** What a Lissie run knows about its caller. */
type LissieRequestContext = { userId: string };

const requestContextSchema = z.object({ userId: z.string().min(1) });

/**
 * The request context for one run on behalf of the signed-in user. Untyped, as the AG-UI bridge
 * takes it; every tool validates it against requestContextSchema before it runs.
 */
export function lissieRequestContext(userId: string): RequestContext {
  return new RequestContext([["userId", userId]]);
}

/** The run's user; Mastra has validated the context against requestContextSchema already. */
function userIdOf(context: {
  requestContext?: RequestContext<LissieRequestContext>;
}): string {
  const userId = context.requestContext?.get("userId");
  if (!userId)
    throw new Error("Lissie's tools need a user in the request context");
  return userId;
}

// A todo the user doesn't have is a result for Lissie to handle, in the contract's error shape.
async function orError<T>(work: () => Promise<T>): Promise<T | ErrorBody> {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof TodoError)) throw error;
    return { error: { code: error.code, message: error.message } };
  }
}

const listTodosTool = createTool({
  id: LISSIE_TOOLS.listTodos,
  description:
    "Lists the user's todos, open ones first. Filter by status (open, done or all) and by a case-insensitive piece of the title. Use it to find a todo's id.",
  inputSchema: todoFilterSchema,
  outputSchema: z.object({ todos: z.array(todoSchema) }),
  requestContextSchema,
  execute: async (filter, context) => ({
    todos: await listTodos(userIdOf(context), filter),
  }),
});

const addTodoTool = createTool({
  id: LISSIE_TOOLS.addTodo,
  description:
    "Adds a todo to the user's list, with an optional due date (yyyy-mm-dd).",
  inputSchema: newTodoSchema,
  outputSchema: todoSchema,
  requestContextSchema,
  execute: async (input, context) => addTodo(userIdOf(context), input),
});

const setTodoDoneTool = createTool({
  id: LISSIE_TOOLS.setTodoDone,
  description:
    "Marks one of the user's todos done (done: true) or reopens it (done: false). Takes the todo's id from listTodos.",
  inputSchema: z.strictObject({ id: z.string().min(1), done: z.boolean() }),
  outputSchema: z.union([todoSchema, errorBodySchema]),
  requestContextSchema,
  execute: async ({ id, done }, context) =>
    orError(() => updateTodo(userIdOf(context), id, { done })),
});

// The card is A2UI the chat renders (lib/lissie-progress.ts); the counts come from the service,
// so the model never produces a number on it, and no second model call designs it.
const showProgressTool = createTool({
  id: LISSIE_TOOLS.showProgress,
  description:
    "Shows the user a card in the chat with their progress on the list: how many todos there are, how many are done and how many are open. The card shows the numbers, so don't repeat them all.",
  inputSchema: z.strictObject({}),
  outputSchema: z.object({
    a2ui_operations: z.array(z.record(z.string(), z.unknown())),
  }),
  requestContextSchema,
  execute: async (_input, context) => {
    const todos = await listTodos(userIdOf(context));
    const done = todos.filter((todo) => todo.done).length;
    return progressCard({
      total: todos.length,
      done,
      open: todos.length - done,
    });
  },
});

/** Keyed by the names the model sees, which the chat renders by (lib/lissie-tool-calls.ts). */
export const lissieTools = {
  [LISSIE_TOOLS.listTodos]: listTodosTool,
  [LISSIE_TOOLS.addTodo]: addTodoTool,
  [LISSIE_TOOLS.setTodoDone]: setTodoDoneTool,
  [LISSIE_TOOLS.showProgress]: showProgressTool,
};
