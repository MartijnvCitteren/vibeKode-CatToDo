// Writes the OpenAPI description built from the contract to contract/openapi.json (`npm run openapi`).
import { writeFileSync } from "node:fs";
import { openApiDocument } from "@todo-cat/contract/openapi";

writeFileSync(
  new URL("../contract/openapi.json", import.meta.url),
  `${JSON.stringify(openApiDocument, null, 2)}\n`,
);
