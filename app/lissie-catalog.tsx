import { createCatalog } from "@copilotkit/a2ui-renderer";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  LISSIE_CATALOG_ID,
  lissieCatalogDefinitions,
} from "@/lib/lissie-catalog";

// The renderers behind lib/lissie-catalog.ts, next to the basic catalog's own (Card, Column, Text, …).
// The binder hands each renderer its props resolved from the surface's data model.

const number = (value: unknown) => (typeof value === "number" ? value : 0);
const text = (value: unknown) =>
  typeof value === "string" ? value : undefined;

export const lissieCatalog = createCatalog(
  lissieCatalogDefinitions,
  {
    ProgressBar: ({ props }) => (
      <ProgressBar
        value={number(props.value)}
        max={number(props.max)}
        label={text(props.label)}
      />
    ),
  },
  { catalogId: LISSIE_CATALOG_ID, includeBasicCatalog: true },
);
