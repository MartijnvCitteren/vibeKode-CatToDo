# Agent

Lissie is the app's one AI agent: a Mastra agent served to the CopilotKit chat on `/` over AG-UI, with tools on the signed-in user's list.

```
 browser: CopilotChat ──▶ /api/copilotkit/[[...slug]] ──▶ CopilotRuntime ──▶ MastraAgent (AG-UI bridge)
          (react-core/v2)   hooks: session + thread check     LissieRunner          │
                                                                                     ▼
                                          lib/lissie.ts: Agent `lissie` + Mastra memory ──▶ SQLite (lib/db.ts)
                                                         │ tools (lib/lissie-tools.ts)
                                                         ▼
                                                   todo service
```

## Pieces

- `lib/lissie.ts` holds the agent, its system prompt, the `Mastra` instance, the thread id rules and the history reader.
- `lib/lissie-tools.ts` holds her tools, `listTodos`, `addTodo` and `setTodoDone`: the agent adapter on the todo service (see [architecture.md](architecture.md)).
- `lib/lissie-tool-calls.ts` holds the tool names and the one line the chat shows per call; it has no server code, so the browser imports it.
- `app/api/copilotkit/runtime.ts` builds the CopilotKit runtime, its auth hooks and `LissieRunner`; the catch-all route only re-exports the handler.
- `app/lissie-chat.tsx` is the client chat (`CopilotKitProvider` + `CopilotChat` from `@copilotkit/react-core/v2`); `app/page.tsx` passes it the agent id and the user's current thread id.
- `app/lissie-actions.ts` holds the server action behind the chat's "New conversation" button.
- `app/todo-sidebar.tsx` is the read-only list next to the chat; Lissie is the browser's only way to change the list.
- Versions are pinned exactly (Mastra, `@ag-ui/*`, CopilotKit), because these packages move fast and must agree on the AG-UI event shapes.

## Model

- OpenRouter through Mastra's model router: `openrouter/${OPENROUTER_MODEL}`, default `z-ai/glm-5.3-flash`.
- The model is a function, so `OPENROUTER_MODEL` and `OPENROUTER_API_KEY` are read per run; the key is passed explicitly and never reaches the browser.
- Check a model id with `node .agents/skills/mastra/scripts/provider-registry.mjs --provider openrouter` before changing the default.

## Memory

- `LibSQLStore` gets `db.$client`, so Mastra's tables (`mastra_*`) live in the app's SQLite file on the same connection; Mastra creates them itself on first use, outside Drizzle's migrations.
- Every thread id names its user: the first is `lissieThreadId(userId)` (`lissie-<userId>`), later ones add a UUID (`newLissieThreadId`), and `lissieThreadUser` reads the user back; the Better Auth user id is Mastra's `resourceId`.
- Better Auth ids are alphanumeric, which is what makes stripping the UUID suffix unambiguous.
- The current conversation is the user's newest Mastra thread by `createdAt` (`currentLissieThreadId`), or their first thread id before they have one.
- "New conversation" creates an empty Mastra thread (`startLissieThread`) and refreshes the page; the page keys the chat on the thread id, so it remounts on the new thread. Earlier threads stay in memory, but the chat offers no way back to them.
- The button is disabled on an empty chat and while Lissie answers, so empty threads don't pile up and no reply is cut off.
- User and thread come from the server session, never from the client: the runtime builds the `MastraAgent` per request with `resourceId` from `getUserId`, and the page passes the thread id down.
- Mastra memory is the one record of the conversation. The bridge sends Mastra only messages it hasn't stored, matched by id, so replayed history keeps Mastra's message ids.

## Tools

- No tool takes a user id. The runtime builds a Mastra `RequestContext` with `userId` from the session (`lissieRequestContext`) and hands it to the AG-UI bridge per request; each tool reads its owner from there.
- Each tool declares a `requestContextSchema`, so Mastra refuses to run it without a user, and its input schema is a strict contract schema, so a `userId` the model makes up fails validation.
- The bridge puts client-sent AG-UI context under its own `ag-ui` key, so a client can't overwrite `userId` either.
- `setTodoDone` answers another user's or a missing todo with the contract's error body (`todo-not-found`) instead of throwing, so Lissie can say so.
- The system prompt is a function, so it carries today's date for due dates like "tomorrow".
- Her persona comments on every todo she adds or marks done; anything about feeding the cat is personal.

## Chat and sidebar

- `useRenderTool` renders each tool call as one line (`data-testid="lissie-tool-call"`) from its arguments and its result, which arrives as a JSON string; the same renderer serves live runs and replayed history.
- The page renders the sidebar on the server with `listTodos`; after a live `TOOL_CALL_RESULT` of a write tool (`LISSIE_WRITE_TOOLS`), the chat calls `router.refresh()`, which keeps the chat's client state.
- A replayed history arrives as a snapshot, not as tool call results, so a reload doesn't trigger refreshes.

## Runtime routes and authorization

- Memory scoping is authorization: the thread id is not a secret, so every route checks it against the session.
- `onRequest` answers 401 for any request without a session (cookie or bearer), before routing, so unknown routes are covered too.
- `onBeforeHandler` is an allow-list: `info`, plus `agent/run`, `agent/connect` (thread id read from a clone of the JSON body) and `agent/stop` (thread id in the path) on a thread whose id names the caller. Everything else answers 404, including another user's thread.
- Refused routes include the thread list, messages, events and state routes, clear, archive, update, subscribe, suggest, transcribe, the inspector and trajectory routes, and memories (which the runtime also hides).
- `LissieRunner` extends `AgentRunner`, not `InMemoryAgentRunner`, so the runtime's ownerless local thread routes are not served even if the allow-list changed.
- `lissieHistory` reads a thread only when Mastra stores it under the user the thread id names, and only that user's messages.
- The provider sets `useSingleEndpoint={false}`, because the handler is multi-route.
- CopilotKit's Inspector overlay (dev builds only) works for Agent and AG-UI Events; without Intelligence its Rich Threads pane shows local examples and requests nothing the runtime refuses.

## History and restarts

- A live run streams through an in-process `InMemoryAgentRunner`; `connect` re-attaches to it while it runs.
- Between runs, `connect` replays the thread from Mastra memory as `RUN_STARTED`, `MESSAGES_SNAPSHOT`, `RUN_FINISHED`, so history survives a restart without a second store.
- The replay rebuilds what the live stream showed: the stored assistant message carries all its tool calls, each result follows as a `tool` message, and text after a tool call is a continuation message `<id>-agui-text` (then `-agui-text-2`, …).
- Those continuation ids are the bridge's own, and it treats them as the stored message, so a run after a replay sends Mastra only the new turn; `runtime.test.ts` checks that memory gains no duplicates.
- Reasoning is not replayed.
- A failed run (bad key, model down) shows a line under the chat via `CopilotChat`'s `onError`.

## Tests

- `app/api/copilotkit/runtime.test.ts` calls the handler for every route the runtime serves, without a session, with another user's session and with the owner's, against a temp database.
- It swaps in `MockLanguageModelV3` from `ai/test` through Mastra's internal `__updateModel`, so it never calls OpenRouter; the mock calls `addTodo` for "Add <title>", which proves the session's user reaches the tool.
- `lib/lissie-tools.test.ts` runs the tool executors on a temp database with two users; `lib/lissie-tool-calls.test.ts` covers the chat lines.
- `npm run test:chat` (`e2e/chat/`, `playwright.chat.config.ts`) chats with the real model: it asks Lissie to add "buy milk", finds it in the sidebar, reloads, and starts a new conversation; it needs `OPENROUTER_API_KEY` in `.env` and stays out of `npm run qa` and CI.
- `e2e/new-conversation.spec.ts` only checks that the button is disabled on an empty chat, since QA has no model.
- A tool call splits her turn into several assistant messages in the chat, so tests don't count her messages.

## Gotchas

- Mastra registers agents by record key, and CopilotKit routes by that key: keep the key, the agent `id` and `LISSIE_AGENT_ID` the same.
- The model sees a tool under its record key in `lissieTools`, and the chat renders by that name: keep both on `LISSIE_TOOLS`.
- The bridge takes an untyped `RequestContext`; a typed one is not assignable, which is why `lissieRequestContext` returns it untyped and the tools validate it instead.
- Import the runtime and React APIs from the `/v2` subpaths; the package roots are the deprecated v1 surface.
- `useAgent({ agentId, threadId })` is a type error by design: bind to the shared agent with `agentId` alone, and let `CopilotChat` pin the thread.
- Mastra's `recall` with a `resourceId` throws for a thread that doesn't exist yet, which is why `lissieHistory` looks the thread up first.
- CopilotKit's runtime logs that its telemetry is on; set `COPILOTKIT_TELEMETRY_DISABLED=true` to opt out.
