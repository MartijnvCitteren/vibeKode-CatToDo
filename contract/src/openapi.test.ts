import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { openApiDocument } from "./openapi";

test("contract/openapi.json matches the contract (run `npm run openapi` if not)", () => {
  const committed = JSON.parse(
    readFileSync(new URL("../openapi.json", import.meta.url), "utf8"),
  );
  expect(committed).toEqual(openApiDocument);
});

test("every $ref points at a component that exists", () => {
  const refs =
    JSON.stringify(openApiDocument).matchAll(/"\$ref":"#\/([^"]+)"/g);
  for (const [, path] of refs) {
    const target = path
      .split("/")
      .reduce<unknown>(
        (node, key) => (node as Record<string, unknown> | undefined)?.[key],
        openApiDocument,
      );
    expect(target, path).toBeDefined();
  }
});
