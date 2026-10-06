import { loadEnvConfig } from "@next/env";
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// The chat e2e (`npm run test:chat`) talks to the real model, so it stays out of QA and CI
// (see tech-docs/testing.md); it reuses the QA config's isolated server and database.
loadEnvConfig(process.cwd());
if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("Set OPENROUTER_API_KEY in .env to run the chat e2e test");
}

export default defineConfig({
  ...base,
  testDir: "./e2e/chat",
  testIgnore: undefined,
  retries: 0,
});
