import "server-only";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { authOptions } from "./auth-options";
import { db } from "./db";
import * as schema from "./schema";

// The Better Auth server instance; only lib/session.ts and the auth actions and route use it (see tech-docs/auth.md).
export const auth = betterAuth({
  ...authOptions,
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  // nextCookies lets Server Actions set the session cookie; it must stay the last plugin.
  plugins: [...authOptions.plugins, nextCookies()],
});
