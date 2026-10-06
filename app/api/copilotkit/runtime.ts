import "server-only";
import { type BaseEvent, EventType } from "@ag-ui/client";
import { MastraAgent } from "@ag-ui/mastra";
import {
  AgentRunner,
  type AgentRunnerConnectRequest,
  type AgentRunnerIsRunningRequest,
  type AgentRunnerRunRequest,
  type AgentRunnerStopRequest,
  CopilotRuntime,
  createCopilotRuntimeHandler,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";
import { defer, from, mergeAll, type Observable } from "rxjs";
import {
  LISSIE_AGENT_ID,
  lissieHistory,
  lissieThreadUser,
  mastra,
} from "@/lib/lissie";
import { lissieRequestContext } from "@/lib/lissie-tools";
import { getUserId } from "@/lib/session";

// The CopilotKit runtime that serves Lissie over AG-UI (see tech-docs/agent.md).
// Every route needs a session, and only the chat's own routes on one of the caller's own threads get through.

export const BASE_PATH = "/api/copilotkit";

/**
 * Runs stay in process memory while they stream; a connect between runs replays the thread
 * from Mastra memory instead, so a conversation survives a restart and Mastra is its one record.
 * It extends `AgentRunner`, not `InMemoryAgentRunner`, so the runtime's thread-list routes,
 * which read the in-memory store without any owner, are not served at all.
 */
class LissieRunner extends AgentRunner {
  private readonly live = new InMemoryAgentRunner();

  run(request: AgentRunnerRunRequest): Observable<BaseEvent> {
    return this.live.run(request);
  }

  connect(request: AgentRunnerConnectRequest): Observable<BaseEvent> {
    return defer(async () =>
      (await this.live.isRunning(request))
        ? this.live.connect(request)
        : from(await replay(request.threadId)),
    ).pipe(mergeAll());
  }

  isRunning(request: AgentRunnerIsRunningRequest): Promise<boolean> {
    return this.live.isRunning(request);
  }

  stop(request: AgentRunnerStopRequest): Promise<boolean | undefined> {
    return this.live.stop(request);
  }
}

/** A finished run that hands the client the thread's stored messages; nothing for a new thread. */
async function replay(threadId: string): Promise<BaseEvent[]> {
  const messages = await lissieHistory(threadId);
  if (messages.length === 0) return [];
  const runId = crypto.randomUUID();
  return [
    { type: EventType.RUN_STARTED, threadId, runId } as BaseEvent,
    { type: EventType.MESSAGES_SNAPSHOT, messages } as BaseEvent,
    { type: EventType.RUN_FINISHED, threadId, runId } as BaseEvent,
  ];
}

function errorResponse(status: number, error: string, message: string) {
  return Response.json({ error, message }, { status });
}

/** The signed-in user's id, or a thrown 401 the runtime sends as is. */
async function requireUserId(request: Request): Promise<string> {
  const userId = await getUserId(request);
  if (!userId) {
    throw errorResponse(401, "Unauthorized", "Sign in to talk to Lissie");
  }
  return userId;
}

/** The thread a run or connect body names, or null when the body has none. */
async function bodyThreadId(request: Request): Promise<string | null> {
  try {
    // A clone, because the runtime still reads the body afterwards.
    const body: unknown = await request.clone().json();
    if (typeof body === "object" && body !== null && "threadId" in body) {
      return typeof body.threadId === "string" ? body.threadId : null;
    }
  } catch {
    // Not JSON: no thread, so the request is refused below.
  }
  return null;
}

const runtime = new CopilotRuntime({
  // Per request, so Mastra memory and Lissie's tools work for the session's user, never a client value:
  // the user id is the memory's resource and the request context her tools read their owner from.
  agents: async ({ request }) => {
    const userId = await requireUserId(request);
    return {
      lissie: MastraAgent.getLocalAgent({
        mastra,
        agentId: LISSIE_AGENT_ID,
        resourceId: userId,
        requestContext: lissieRequestContext(userId),
      }),
    };
  },
  runner: new LissieRunner(),
});

export const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: BASE_PATH,
  hooks: {
    // Before routing, so no route, known or unknown, answers an anonymous caller.
    onRequest: async ({ request }) => {
      await requireUserId(request);
    },
    // Allow-list: discovery, plus run, connect and stop on a thread the caller owns.
    // Everything else (thread lists and history, transcribe, suggestions, inspector, …) is not found,
    // and so is another user's thread, so the API never confirms that it exists.
    onBeforeHandler: async ({ request, route }) => {
      const userId = await requireUserId(request);
      const owns = (threadId: string | null) =>
        threadId !== null && lissieThreadUser(threadId) === userId;
      switch (route.method) {
        case "info":
          return;
        case "agent/run":
        case "agent/connect":
          if (owns(await bodyThreadId(request))) return;
          break;
        case "agent/stop":
          if (owns(route.threadId)) return;
          break;
      }
      throw errorResponse(404, "Not found", "Lissie has nothing for you here");
    },
  },
});
