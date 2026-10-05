import { CLI_CLIENT_ID } from "@todo-cat/contract";
import type { BetterAuthOptions } from "better-auth";
import { bearer, deviceAuthorization } from "better-auth/plugins";

// Everything that shapes the auth tables and endpoints, kept free of `server-only`
// so the Better Auth CLI can load it too (see tech-docs/auth.md).
export const authOptions = {
  emailAndPassword: { enabled: true },
  plugins: [
    // Device tokens are unsigned session tokens, so bearer must keep accepting those.
    bearer(),
    deviceAuthorization({
      verificationUri: "/device",
      validateClient: (clientId) => clientId === CLI_CLIENT_ID,
    }),
  ],
} satisfies BetterAuthOptions;
