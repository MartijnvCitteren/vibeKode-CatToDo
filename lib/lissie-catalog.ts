import { DynamicNumberSchema, DynamicStringSchema } from "@a2ui/web_core/v0_9";
import type { CatalogDefinitions } from "@copilotkit/a2ui-renderer";
// The A2UI packages are built on zod 3 (this exact version): their types take its schemas, and
// their binder reads its internals to tell a bindable prop from a literal one.
import { z } from "zod3";

// The A2UI catalog the chat renders Lissie's cards with: the basic catalog plus the components
// below (see tech-docs/agent.md). No React here, so her tools and their tests import it too.

/** The catalog every surface Lissie creates names, and the chat registers its renderers under. */
export const LISSIE_CATALOG_ID = "todo-cat://lissie-catalog";

export const lissieCatalogDefinitions = {
  ProgressBar: {
    description:
      "A horizontal bar filled to value out of max, with an optional label and the percentage above it.",
    props: z.object({
      value: DynamicNumberSchema,
      max: DynamicNumberSchema,
      label: DynamicStringSchema.optional(),
    }),
  },
} satisfies CatalogDefinitions;
