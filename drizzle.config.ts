import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Loads .env the way Next.js does, so drizzle-kit and the app read the same DATABASE_URL.
loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");

export default defineConfig({
  dialect: "turso",
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
