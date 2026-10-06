import {
  A2UIProvider,
  A2UIRenderer,
  useA2UIActions,
  useA2UIError,
} from "@copilotkit/a2ui-renderer";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { expect, test } from "vitest";
import { PROGRESS_SURFACE_ID, progressCard } from "@/lib/lissie-progress";
import { lissieCatalog } from "./lissie-catalog";

// The card as the chat draws it: showProgress's operations through A2UI's React renderer
// and the chat's catalog, so the numbers reach the ProgressBar and the text through the data model.

function Card({
  operations,
}: {
  operations: ReturnType<typeof progressCard>["a2ui_operations"];
}) {
  const { processMessages } = useA2UIActions();
  const error = useA2UIError();
  useEffect(() => processMessages(operations), [processMessages, operations]);
  if (error) return <p>{error}</p>;
  return <A2UIRenderer surfaceId={PROGRESS_SURFACE_ID} />;
}

test("draws the progress card with the numbers from its data model", async () => {
  const { a2ui_operations } = progressCard({ total: 4, done: 1, open: 3 });
  render(
    <A2UIProvider catalog={lissieCatalog}>
      <Card operations={a2ui_operations} />
    </A2UIProvider>,
  );

  const bar = await screen.findByRole("progressbar", { name: "Done" });
  expect(bar.getAttribute("aria-valuenow")).toBe("1");
  expect(bar.getAttribute("aria-valuemax")).toBe("4");
  expect(screen.getByText("25%")).toBeDefined();
  expect(screen.getByText("Your list")).toBeDefined();
  expect(screen.getByText("1 done, 3 open, 4 in total")).toBeDefined();
});
