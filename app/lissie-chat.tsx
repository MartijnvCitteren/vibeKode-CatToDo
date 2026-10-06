"use client";

import {
  CopilotChat,
  CopilotKitProvider,
  UseAgentUpdate,
  useAgent,
} from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { useEffect, useState } from "react";
import { FormError } from "@/components/ui/form-error";

type ChatProps = { agentId: string; threadId: string };

// The chat with Lissie. The server page hands in her agent id and the user's one thread, so the
// chat replays that thread's history on load; the runtime refuses any other thread anyway.
export function LissieChat(props: ChatProps) {
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      // The runtime is multi-route (app/api/copilotkit/[[...slug]]), so skip the transport probe.
      useSingleEndpoint={false}
      // The Inspector reads routes the runtime doesn't serve.
      enableInspector={false}
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
    updates: [UseAgentUpdate.OnRunStatusChanged],
  });
  useEffect(() => {
    if (agent.isRunning) setError(undefined);
  }, [agent.isRunning]);

  return (
    <div className="flex h-full flex-col">
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
            "Lissie is a cat. She can't touch your list yet, and she knows it.",
        }}
      />
      <div className="px-4 pb-2 text-center">
        <FormError message={error} />
      </div>
    </div>
  );
}
