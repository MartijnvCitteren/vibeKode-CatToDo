"use client";

import {
  CopilotChat,
  CopilotKitProvider,
  UseAgentUpdate,
  useAgent,
  useRenderTool,
} from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import {
  addTodoArgs,
  addTodoLine,
  LISSIE_TOOLS,
  LISSIE_WRITE_TOOLS,
  listTodosArgs,
  listTodosLine,
  setTodoDoneArgs,
  setTodoDoneLine,
} from "@/lib/lissie-tool-calls";
import { startNewConversation } from "./lissie-actions";

type ChatProps = { agentId: string; threadId: string };

// The chat with Lissie. The server page hands in her agent id and the user's current thread, so the
// chat replays that thread's history on load; the runtime refuses threads of other users anyway.
export function LissieChat(props: ChatProps) {
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      // The runtime is multi-route (app/api/copilotkit/[[...slug]]), so skip the transport probe.
      useSingleEndpoint={false}
      showIntelligenceIndicator={false}
    >
      <Chat {...props} />
    </CopilotKitProvider>
  );
}

function Chat({ agentId, threadId }: ChatProps) {
  // A failed run (model down, no key) otherwise only reaches the console.
  const [error, setError] = useState<string>();
  // The shared agent the chat drives; CopilotChat pins it to threadId.
  const { agent } = useAgent({
    agentId,
    updates: [
      UseAgentUpdate.OnRunStatusChanged,
      UseAgentUpdate.OnMessagesChanged,
    ],
  });
  const [starting, startTransition] = useTransition();
  useEffect(() => {
    if (agent.isRunning) setError(undefined);
  }, [agent.isRunning]);
  useToolCallLines(agentId);
  useRefreshAfterWrites(agent);

  return (
    <div className="flex h-full flex-col px-[5px]">
      <div className="flex justify-end px-4 pt-3">
        <Button
          type="button"
          variant="secondary"
          className="h-9 px-3"
          // Nothing to leave behind in an empty chat, and a running reply would be cut off.
          disabled={starting || agent.isRunning || agent.messages.length === 0}
          onClick={() => startTransition(() => startNewConversation())}
        >
          New conversation
        </Button>
      </div>
      <CopilotChat
        agentId={agentId}
        threadId={threadId}
        className="min-h-0 flex-1"
        onError={() =>
          setError("Lissie wandered off mid-thought. Try again in a moment.")
        }
        labels={{
          chatInputPlaceholder: "Tell Lissie what needs doing",
          chatDisclaimerText:
            "Lissie is a cat. She keeps your list, mostly as asked.",
        }}
      />
      <div className="px-4 pb-2 text-center">
        <FormError message={error} />
      </div>
    </div>
  );
}

type SharedAgent = ReturnType<typeof useAgent>["agent"];

/**
 * Reloads the page's server-rendered list after each of Lissie's tool calls that changed it.
 * Live results only: a replayed history arrives as a snapshot, not as tool call results.
 */
function useRefreshAfterWrites(agent: SharedAgent) {
  const router = useRouter();
  useEffect(() => {
    const { unsubscribe } = agent.subscribe({
      onToolCallResultEvent: ({ event, messages }) => {
        const name = messages
          .flatMap((m) => (m.role === "assistant" ? (m.toolCalls ?? []) : []))
          .find((call) => call.id === event.toolCallId)?.function.name;
        if (name && LISSIE_WRITE_TOOLS.has(name)) router.refresh();
      },
    });
    return unsubscribe;
  }, [agent, router]);
}

/** Shows each of Lissie's tool calls in the chat as one line, live and in the replayed history. */
function useToolCallLines(agentId: string) {
  useRenderTool(
    {
      name: LISSIE_TOOLS.listTodos,
      agentId,
      parameters: listTodosArgs,
      render: ({ parameters, result }) => (
        <ToolCallLine
          text={listTodosLine(parameters, result)}
          done={result !== undefined}
        />
      ),
    },
    [agentId],
  );
  useRenderTool(
    {
      name: LISSIE_TOOLS.addTodo,
      agentId,
      parameters: addTodoArgs,
      render: ({ parameters, result }) => (
        <ToolCallLine
          text={addTodoLine(parameters, result)}
          done={result !== undefined}
        />
      ),
    },
    [agentId],
  );
  useRenderTool(
    {
      name: LISSIE_TOOLS.setTodoDone,
      agentId,
      parameters: setTodoDoneArgs,
      render: ({ parameters, result }) => (
        <ToolCallLine
          text={setTodoDoneLine(parameters, result)}
          done={result !== undefined}
        />
      ),
    },
    [agentId],
  );
}

function ToolCallLine({ text, done }: { text: string; done: boolean }) {
  return (
    <p
      data-testid="lissie-tool-call"
      className="my-1 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400"
    >
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${
          done ? "bg-zinc-400 dark:bg-zinc-500" : "animate-pulse bg-amber-500"
        }`}
      />
      {text}
    </p>
  );
}
