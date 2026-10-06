# Agent

Lissie is the app's one AI agent: a Mastra agent served to the CopilotKit chat on `/` over AG-UI.

```
 browser: CopilotChat ──▶ /api/copilotkit/[[...slug]] ──▶ CopilotRuntime ──▶ MastraAgent (AG-UI bridge)
          (react-core/v2)   hooks: session + thread check     LissieRunner          │
                                                                                     ▼
                                          lib/lissie.ts: Agent `lissie` + Mastra memory ──▶ SQLite (lib/db.ts)
```

## Pieces

- `lib/lissie.ts` holds the agent, its system prompt, the `Mastra` instance, the thread id rule and the history reader.
- `app/api/copilotkit/runtime.ts` builds the CopilotKit runtime, its auth hooks and `LissieRunner`; the catch-all route only re-exports the handler.
- `app/lissie-chat.tsx` is the client chat (`CopilotKitProvider` + `CopilotChat` from `@copilotkit/react-core/v2`); `app/page.tsx` passes it the agent id and the user's thread id.
- Versions are pinned exactly (Mastra, `@ag-ui/*`, CopilotKit), because these packages move fast and must agree on the AG-UI event shapes.

## Model

- OpenRouter through Mastra's model router: `openrouter/${OPENROUTER_MODEL}`, default `z-ai/glm-5.3-flash`.
- The model is a function, so `OPENROUTER_MODEL` and `OPENROUTER_API_KEY` are read per run; the key is passed explicitly and never reaches the browser.
- Check a model id with `node .agents/skills/mastra/scripts/provider-registry.mjs --provider openrouter` before changing the default.

## Memory

- `LibSQLStore` gets `db.$client`, so Mastra's tables (`mastra_*`) live in the app's SQLite file on the same connection; Mastra creates them itself on first use, outside Drizzle's migrations.
- One thread per user: `lissieThreadId(userId)` (`lissie-<userId>`), with the Better Auth user id as Mastra's `resourceId`.
- Both come from the server session, never from the client: the runtime builds the `MastraAgent` per request with `resourceId` from `getUserId`, and the page passes the thread id down.
- Mastra memory is the one record of the conversation. The bridge sends Mastra only messages it hasn't stored, matched by id, so replayed history keeps Mastra's message ids.

## Runtime routes and authorization

- Memory scoping is authorization: the thread id is not a secret, so every route checks it against the session.
- `onRequest` answers 401 for any request without a session (cookie or bearer), before routing, so unknown routes are covered too.
- `onBeforeHandler` is an allow-list: `info`, plus `agent/run`, `agent/connect` (thread id read from a clone of the JSON body) and `agent/stop` (thread id in the path) on the caller's own thread. Everything else answers 404, including another user's thread.
- Refused routes include the thread list, messages, events and state routes, clear, archive, update, subscribe, suggest, transcribe, the inspector and trajectory routes, and memories (which the runtime also hides).
- `LissieRunner` extends `AgentRunner`, not `InMemoryAgentRunner`, so the runtime's ownerless local thread routes are not served even if the allow-list changed.
- `lissieHistory` reads a thread only when Mastra stores it under the user the thread id names, and only that user's messages.
- The provider sets `useSingleEndpoint={false}` (the handler is multi-route) and `enableInspector={false}` (the Inspector reads refused routes).

## History and restarts

- A live run streams through an in-process `InMemoryAgentRunner`; `connect` re-attaches to it while it runs.
- Between runs, `connect` replays the thread from Mastra memory as `RUN_STARTED`, `MESSAGES_SNAPSHOT`, `RUN_FINISHED`, so history survives a restart without a second store.
- The replay keeps text only; when tools arrive, `lissieHistory` must also turn tool calls and results into AG-UI messages.
- A failed run (bad key, model down) shows a line under the chat via `CopilotChat`'s `onError`.

## Tests

- `app/api/copilotkit/runtime.test.ts` calls the handler for every route the runtime serves, without a session, with another user's session and with the owner's, against a temp database.
- It swaps in `MockLanguageModelV3` from `ai/test` through Mastra's internal `__updateModel`, so it never calls OpenRouter.
- `npm run test:chat` (`e2e/chat/`, `playwright.chat.config.ts`) chats with the real model and reloads; it needs `OPENROUTER_API_KEY` in `.env` and stays out of `npm run qa` and CI.

## Gotchas

- Mastra registers agents by record key, and CopilotKit routes by that key: keep the key, the agent `id` and `LISSIE_AGENT_ID` the same.
- Import the runtime and React APIs from the `/v2` subpaths; the package roots are the deprecated v1 surface.
- `useAgent({ agentId, threadId })` is a type error by design: bind to the shared agent with `agentId` alone, and let `CopilotChat` pin the thread.
- Mastra's `recall` with a `resourceId` throws for a thread that doesn't exist yet, which is why `lissieHistory` looks the thread up first.
- CopilotKit's runtime logs that its telemetry is on; set `COPILOTKIT_TELEMETRY_DISABLED=true` to opt out.
