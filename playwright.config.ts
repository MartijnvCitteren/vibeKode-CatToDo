import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

// Workers re-evaluate this file, so the port is picked once and handed down through the environment.
process.env.E2E_PORT ??= execFileSync(process.execPath, [
  "-e",
  "const s = require('node:net').createServer().listen(0, () => { console.log(s.address().port); s.close(); });",
])
  .toString()
  .trim();
const baseURL = `http://localhost:${process.env.E2E_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `next dev --port ${process.env.E2E_PORT}`,
    url: baseURL,
    // A separate build dir so this server does not collide with `npm run dev`'s lock on .next/dev.
    env: { NEXT_DIST_DIR: ".next/e2e" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
