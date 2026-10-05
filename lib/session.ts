import "server-only";
import { auth } from "./auth";

/**
 * The signed-in user's id for a request, from its session cookie or `Authorization: Bearer <token>`, or null.
 * The one place that reads sessions: pages, REST routes, agent tools and MCP all go through it.
 * Server Components pass `{ headers: await headers() }`.
 */
export async function getUserId(request: {
  headers: Headers;
}): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}
