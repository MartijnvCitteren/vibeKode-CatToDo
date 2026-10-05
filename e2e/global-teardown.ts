import { rm } from "node:fs/promises";

// Removes the throwaway database directory that playwright.config.ts created for the e2e server.
export default async function globalTeardown() {
  const dir = process.env.E2E_DATABASE_TMPDIR;
  if (dir) await rm(dir, { recursive: true, force: true });
}
