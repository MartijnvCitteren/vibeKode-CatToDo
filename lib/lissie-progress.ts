import type { A2uiMessageList, AnyComponent } from "@a2ui/web_core/v0_9";
import { LISSIE_CATALOG_ID } from "./lissie-catalog";

// The progress card Lissie's showProgress tool puts in the chat, as A2UI (see tech-docs/agent.md).
// The tree is fixed and holds no numbers: they live in the surface's data model, and the
// components read them by path, so the tool only fills the data model in.

/** How far along a user's list is; the tool counts it from the todo service, never the model. */
export type ListProgress = { total: number; done: number; open: number };

/** Every card gets its own surface in the chat, so one id serves them all. */
export const PROGRESS_SURFACE_ID = "list-progress";

/** A data model path inside a formatString template, as A2UI writes it: `${/done}`. */
const at = (path: string) => `\${${path}}`;

const CARD: AnyComponent[] = [
  { id: "root", component: "Card", child: "body" },
  {
    id: "body",
    component: "Column",
    children: ["title", "bar", "summary"],
  },
  { id: "title", component: "Text", variant: "h4", text: "Your list" },
  {
    id: "bar",
    component: "ProgressBar",
    value: { path: "/done" },
    max: { path: "/total" },
    label: "Done",
  },
  {
    id: "summary",
    component: "Text",
    variant: "caption",
    text: {
      call: "formatString",
      args: {
        value: `${at("/done")} done, ${at("/open")} open, ${at("/total")} in total`,
      },
      returnType: "string",
    },
  },
];

/** The A2UI operations that draw the card for this progress, in the container the A2UI middleware detects. */
export function progressCard(progress: ListProgress): {
  a2ui_operations: A2uiMessageList;
} {
  const surfaceId = PROGRESS_SURFACE_ID;
  return {
    a2ui_operations: [
      {
        version: "v0.9",
        createSurface: { surfaceId, catalogId: LISSIE_CATALOG_ID },
      },
      { version: "v0.9", updateComponents: { surfaceId, components: CARD } },
      {
        version: "v0.9",
        updateDataModel: { surfaceId, path: "/", value: progress },
      },
    ],
  };
}
