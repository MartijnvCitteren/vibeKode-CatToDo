// The OpenAPI 3.1 description of /api/todos (see tech-docs/rest-api.md), built from the contract
// schemas so it cannot drift from them; `npm run openapi` writes it to contract/openapi.json.
import { z } from "zod";
import {
  errorBodySchema,
  newTodoSchema,
  todoChangesSchema,
  todoFilterSchema,
  todoSchema,
} from "./index";

const components = z.registry<{ id: string }>();
components.add(todoSchema, { id: "Todo" });
components.add(newTodoSchema, { id: "NewTodo" });
components.add(todoChangesSchema, { id: "TodoChanges" });
components.add(errorBodySchema, { id: "ErrorBody" });

// Input mode, so the filter's defaulted `status` is optional, as a client may leave it out.
const { schemas } = z.toJSONSchema(components, {
  io: "input",
  uri: (id) => `#/components/schemas/${id}`,
});
// A relative `$id` would move the base URI of every `$ref` inside the component.
for (const schema of Object.values(schemas)) {
  delete schema.$schema;
  delete schema.$id;
}
// The refine that demands one change has no JSON Schema form; in JSON it means one property.
schemas.TodoChanges.minProperties = 1;

const filter = z.toJSONSchema(todoFilterSchema, { io: "input" });
const filterDescriptions: Record<string, string> = {
  status: "Which todos to list; `all` when left out.",
  search:
    "A case-insensitive substring of the title; empty means no text filter.",
};
const filterParameters = Object.entries(filter.properties ?? {}).map(
  ([name, schema]) => ({
    name,
    in: "query",
    required: filter.required?.includes(name) ?? false,
    description: filterDescriptions[name],
    schema,
  }),
);

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });
const json = (id: string) => ({ "application/json": { schema: ref(id) } });
const error = (description: string) => ({
  description,
  content: json("ErrorBody"),
});

const unauthorized = { $ref: "#/components/responses/Unauthorized" };
const validationFailed = { $ref: "#/components/responses/ValidationFailed" };
const todoNotFound = { $ref: "#/components/responses/TodoNotFound" };
const todo = { description: "The todo.", content: json("Todo") };

export const openApiDocument = {
  openapi: "3.1.1",
  info: {
    title: "todo-cat REST API",
    version: "0.1.0",
    description:
      "The to-do list of the signed-in user. Every endpoint needs a bearer token (or a Better Auth session cookie) and only ever sees that user's todos; another user's todo is 404, never 403.",
  },
  servers: [{ url: "http://localhost:3000", description: "Local dev server" }],
  security: [{ bearerAuth: [] }],
  tags: [{ name: "todos", description: "The signed-in user's to-do list." }],
  paths: {
    "/api/todos": {
      get: {
        operationId: "listTodos",
        tags: ["todos"],
        summary: "List todos",
        description:
          "Open before done, then by due date with undated last, then oldest first. An unknown query parameter is a 400.",
        parameters: filterParameters,
        responses: {
          "200": {
            description: "The matching todos.",
            content: {
              "application/json": {
                schema: { type: "array", items: ref("Todo") },
              },
            },
          },
          "400": validationFailed,
          "401": unauthorized,
        },
      },
      post: {
        operationId: "addTodo",
        tags: ["todos"],
        summary: "Add a todo",
        requestBody: { required: true, content: json("NewTodo") },
        responses: {
          "201": { description: "The new todo.", content: json("Todo") },
          "400": validationFailed,
          "401": unauthorized,
        },
      },
    },
    "/api/todos/{id}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      get: {
        operationId: "getTodo",
        tags: ["todos"],
        summary: "Get a todo",
        responses: { "200": todo, "401": unauthorized, "404": todoNotFound },
      },
      patch: {
        operationId: "updateTodo",
        tags: ["todos"],
        summary: "Change a todo",
        description:
          "A missing field stays as it is and `dueDate: null` clears the due date. Marking a done todo done again keeps its first `completedAt`.",
        requestBody: { required: true, content: json("TodoChanges") },
        responses: {
          "200": todo,
          "400": validationFailed,
          "401": unauthorized,
          "404": todoNotFound,
        },
      },
      delete: {
        operationId: "deleteTodo",
        tags: ["todos"],
        summary: "Delete a todo",
        responses: {
          "204": { description: "Deleted; no body." },
          "401": unauthorized,
          "404": todoNotFound,
        },
      },
    },
  },
  components: {
    schemas,
    responses: {
      Unauthorized: error(
        "`unauthorized`: no valid bearer token or session cookie. Checked before the input is validated.",
      ),
      ValidationFailed: error(
        "`validation-failed`: the input breaks the contract or the body isn't JSON. The message is for humans, not for parsing.",
      ),
      TodoNotFound: error(
        "`todo-not-found`: no todo with this id belongs to the user.",
      ),
    },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "A Better Auth session token: from the `set-auth-token` header of `POST /api/auth/sign-in/email`, or from `todo-cat login`.",
      },
    },
  },
};
