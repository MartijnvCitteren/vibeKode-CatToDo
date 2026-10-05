import { setTimeout as sleep } from "node:timers/promises";
import { CLI_CLIENT_ID } from "@todo-cat/contract";
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { notLoggedIn, reach } from "./api";
import { forgetToken, readToken, saveToken } from "./config";
import { CliError } from "./errors";

// Login, whoami and logout go through Better Auth's own client, so its endpoint shapes are not re-declared here.

export type User = { id: string; name: string; email: string };

export type DeviceCode = {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresInSeconds: number;
};

const authClient = (server: string) =>
  createAuthClient({ baseURL: server, plugins: [deviceAuthorizationClient()] });

const bearer = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` },
});

/** The user a token belongs to, or null when the server no longer accepts it. */
async function userFor(server: string, token: string): Promise<User | null> {
  const { data, error } = await reach(server, () =>
    authClient(server).getSession({ fetchOptions: bearer(token) }),
  );
  if (error) {
    throw new CliError(
      "server-error",
      `Session lookup failed: ${error.status} ${error.message ?? error.statusText}`,
    );
  }
  if (!data) return null;
  const { id, name, email } = data.user;
  return { id, name, email };
}

/**
 * Better Auth's device authorization flow (RFC 8628): get a code, let the caller show it,
 * then poll until a signed-in user approves it at /device, and store the session token.
 */
export async function login(
  server: string,
  showCode: (code: DeviceCode) => void,
): Promise<User> {
  const client = authClient(server);
  const started = await reach(server, () =>
    client.device.code({ client_id: CLI_CLIENT_ID }),
  );
  if (!started.data) {
    throw new CliError(
      "server-error",
      `Could not start device login: ${started.error?.error_description ?? started.error?.statusText}`,
    );
  }
  const code = started.data;
  showCode({
    userCode: code.user_code,
    verificationUri: code.verification_uri,
    verificationUriComplete: code.verification_uri_complete,
    expiresInSeconds: code.expires_in,
  });

  let intervalMs = code.interval * 1000;
  for (;;) {
    await sleep(intervalMs);
    const { data, error } = await reach(server, () =>
      client.device.token({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: code.device_code,
        client_id: CLI_CLIENT_ID,
      }),
    );
    if (data) {
      const previous = await readToken(server);
      await saveToken(server, data.access_token);
      // A second login replaces the token, so the old session is revoked rather than left valid.
      if (previous) await revoke(server, previous).catch(() => {});
      const user = await userFor(server, data.access_token);
      if (!user) throw notLoggedIn(server);
      return user;
    }
    switch (error.error) {
      case "authorization_pending":
        break;
      case "slow_down":
        intervalMs += 5000;
        break;
      case "access_denied":
        throw new CliError("login-denied", "The login request was denied");
      case "expired_token":
        throw new CliError(
          "login-expired",
          "The code expired before anyone approved it; run `todo-cat login` again",
        );
      default:
        throw new CliError(
          "server-error",
          `Device login failed: ${error.error_description ?? error.statusText}`,
        );
    }
  }
}

export async function whoami(server: string): Promise<User> {
  const token = await readToken(server);
  const user = token && (await userFor(server, token));
  if (!user) throw notLoggedIn(server);
  return user;
}

async function revoke(server: string, token: string): Promise<void> {
  const { error } = await reach(server, () =>
    authClient(server).signOut({ fetchOptions: bearer(token) }),
  );
  // 401 means the session is already gone, which is what logout wants anyway.
  if (error && error.status !== 401) {
    throw new CliError(
      "server-error",
      `Could not revoke the session: ${error.status} ${error.message ?? error.statusText}`,
    );
  }
}

/** Revokes the session on the server, then forgets the token; false when there was nothing to log out of. */
export async function logout(server: string): Promise<boolean> {
  const token = await readToken(server);
  if (!token) return false;
  // Keep the token if the server can't be reached, so a retry can still revoke it.
  await revoke(server, token);
  await forgetToken(server);
  return true;
}
