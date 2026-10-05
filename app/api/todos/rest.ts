import "server-only";
import type { ErrorBody, ErrorCode } from "@todo-cat/contract";
import { z } from "zod";
import { getUserId } from "@/lib/session";
import { TodoError } from "@/lib/todo-service";

// The REST adapter's plumbing (see tech-docs/rest-api.md): resolve the user, parse input with
// contract schemas, and map service errors to status codes. The routes only call the service.

const status: Record<ErrorCode, number> = {
  unauthorized: 401,
  "todo-not-found": 404,
  "validation-failed": 400,
};

function errorResponse(code: ErrorCode, message: string): Response {
  const body: ErrorBody = { error: { code, message } };
  return Response.json(body, { status: status[code] });
}

/** Runs `handle` for the signed-in user, or answers 401; a `TodoError` becomes its error response. */
export async function respond(
  request: Request,
  handle: (userId: string) => Promise<Response>,
): Promise<Response> {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return errorResponse(
        "unauthorized",
        "Sign in, or send Authorization: Bearer <token>",
      );
    }
    return await handle(userId);
  } catch (error) {
    if (error instanceof TodoError) {
      return errorResponse(error.code, error.message);
    }
    throw error;
  }
}

/** Parses `input` with a contract schema, or throws `validation-failed` with zod's issues as the message. */
export function parse<S extends z.ZodType>(schema: S, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new TodoError("validation-failed", z.prettifyError(result.error));
  }
  return result.data;
}

/** The JSON request body parsed with a contract schema; a body that isn't JSON is `validation-failed` too. */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new TodoError(
      "validation-failed",
      "The request body is not valid JSON",
    );
  }
  return parse(schema, body);
}
