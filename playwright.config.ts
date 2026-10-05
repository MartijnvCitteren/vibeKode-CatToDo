import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Workers re-evaluate this file, so the port is picked once and handed down through the environment.
process.env.E2E_PORT ??= execFileSync(process.execPath, [
  "-e",
  "const s = require('node:net').createServer().listen(0, () => { console.log(s.address().port); s.close(); });",
])
  .toString()
  .trim();
const baseURL = `http://localhost:${process.env.E2E_PORT}`;
// Same for the server's own database: a throwaway file unless E2E_DATABASE_URL is set, never data/app.db.
if (!process.env.E2E_DATABASE_URL) {
  const dir = mkdtempSync(join(tmpdir(), "todo-cat-e2e-"));
  // Teardown deletes only a directory created here, never one passed in.
  process.env.E2E_DATABASE_TMPDIR = dir;
  process.env.E2E_DATABASE_URL = `file:${join(dir, "e2e.db")}`;
}

export default defineConfig({
  testDir: "./e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `drizzle-kit migrate && next dev --port ${process.env.E2E_PORT}`,
    url: baseURL,
    env: {
      // A separate build dir so this server does not collide with `npm run dev`'s lock on .next/dev.
      NEXT_DIST_DIR: process.env.E2E_DIST_DIR ?? ".next/e2e",
      // Set before .env is read, so both drizzle-kit and Next.js keep this value.
      DATABASE_URL: process.env.E2E_DATABASE_URL,
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
