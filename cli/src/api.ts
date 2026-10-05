import {
  errorBodySchema,
  type NewTodo,
  newTodoSchema,
  type Todo,
  type TodoChanges,
  type TodoFilter,
  todoChangesSchema,
  todoFilterSchema,
  todoSchema,
} from "@todo-cat/contract";
import { z } from "zod";
import { CliError } from "./errors";

// The REST client (see tech-docs/rest-api.md): every request body and every response goes
// through a contract schema, so a server that breaks the shape fails here instead of downstream.

export const notLoggedIn = (server: string) =>
  new CliError(
    "unauthorized",
    `Not logged in to ${server}, or the session expired; run \`todo-cat login\``,
  );

/** Runs a request, turning a connection failure into `server-unreachable`. */
export async function reach<T>(server: string, request: () => Promise<T>) {
  try {
    return await request();
  } catch (error) {
    if (error instanceof TypeError) {
      throw new CliError(
        "server-unreachable",
        `Cannot reach ${server} (${error.cause instanceof Error ? error.cause.message : error.message}); is the server running, and is TODO_CAT_URL right?`,
      );
    }
    throw error;
  }
}

/** Parses CLI input with a contract schema, as the server will, so mistakes fail before any request. */
function parseInput<S extends z.ZodType>(schema: S, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new CliError("validation-failed", z.prettifyError(result.error));
  }
  return result.data;
}

/** The REST client; `token` is only asked for once the input passed its schema. */
export function todoApi(server: string, token: () => Promise<string>) {
  async function call<S extends z.ZodType>(
    method: string,
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<z.infer<S>> {
    const headers = new Headers({ Authorization: `Bearer ${await token()}` });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await reach(server, () =>
      fetch(`${server}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    // DELETE answers 204 with no body; everything else answers JSON.
    const json: unknown =
      response.status === 204
        ? undefined
        : await response.json().catch(() => undefined);

    if (response.ok) {
      const result = schema.safeParse(json);
      if (result.success) return result.data;
      throw new CliError(
        "unexpected-response",
        `${method} ${path} answered ${response.status} with a body that does not match the contract:\n${z.prettifyError(result.error)}`,
      );
    }
    const error = errorBodySchema.safeParse(json);
    if (!error.success) {
      throw new CliError(
        response.status >= 500 ? "server-error" : "unexpected-response",
        `${method} ${path} answered ${response.status} ${response.statusText}`,
      );
    }
    const { code, message } = error.data.error;
    if (code === "unauthorized") throw notLoggedIn(server);
    throw new CliError(code, message);
  }

  const todoPath = (id: string) => `/api/todos/${encodeURIComponent(id)}`;

  return {
    list(filter: Partial<TodoFilter>): Promise<Todo[]> {
      const { status, search } = parseInput(todoFilterSchema, filter);
      const query = new URLSearchParams({ status });
      if (search) query.set("search", search);
      return call("GET", `/api/todos?${query}`, z.array(todoSchema));
    },
    get: (id: string): Promise<Todo> => call("GET", todoPath(id), todoSchema),
    add: (input: NewTodo): Promise<Todo> =>
      call("POST", "/api/todos", todoSchema, parseInput(newTodoSchema, input)),
    update: (id: string, changes: TodoChanges): Promise<Todo> =>
      call(
        "PATCH",
        todoPath(id),
        todoSchema,
        parseInput(todoChangesSchema, changes),
      ),
    remove: async (id: string): Promise<void> => {
      await call("DELETE", todoPath(id), z.undefined());
    },
  };
}
