// Config for `npm run auth:generate`: the Better Auth CLI cannot load lib/auth.ts, which imports `server-only`.
// Same options and adapter, on a throwaway in-memory database the CLI never queries (so its schema check is off).
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/libsql";
import { authOptions } from "../lib/auth-options";

export const auth = betterAuth({
  ...authOptions,
  database: drizzleAdapter(drizzle({ connection: { url: ":memory:" } }), {
    provider: "sqlite",
  }),
  advanced: { database: { validateSchema: false } },
});
