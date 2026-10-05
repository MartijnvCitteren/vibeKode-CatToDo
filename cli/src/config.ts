import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { CliError } from "./errors";

export const DEFAULT_SERVER_URL = "http://localhost:3000";

/** The server the CLI talks to: `TODO_CAT_URL`, or the local dev server. */
export function serverUrl(): string {
  const raw = process.env.TODO_CAT_URL || DEFAULT_SERVER_URL;
  const url = URL.parse(raw);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new CliError("usage", `TODO_CAT_URL is not an http(s) URL: ${raw}`);
  }
  return url.href.replace(/\/+$/, "");
}

/** Where the login token lives: `TODO_CAT_CONFIG_DIR`, else the platform's user config directory. */
export function configDir(): string {
  if (process.env.TODO_CAT_CONFIG_DIR) return process.env.TODO_CAT_CONFIG_DIR;
  if (process.platform === "win32" && process.env.APPDATA) {
    return join(process.env.APPDATA, "todo-cat");
  }
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "todo-cat");
}

export const credentialsFile = () => join(configDir(), "credentials.json");

// Tokens are keyed by server URL, so pointing TODO_CAT_URL elsewhere never sends a token to the wrong server.
const credentialsSchema = z.record(z.string(), z.object({ token: z.string() }));
type Credentials = z.infer<typeof credentialsSchema>;

async function readCredentials(): Promise<Credentials> {
  let text: string;
  try {
    text = await readFile(credentialsFile(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  try {
    return credentialsSchema.parse(JSON.parse(text));
  } catch {
    throw new CliError(
      "credentials-unreadable",
      `${credentialsFile()} is not a valid credentials file; delete it and run \`todo-cat login\``,
    );
  }
}

// Written to a fresh owner-only file and renamed over the old one, so the token is never readable by others.
async function writeCredentials(credentials: Credentials): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  const file = credentialsFile();
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(credentials, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temp, file);
}

export async function readToken(server: string): Promise<string | undefined> {
  return (await readCredentials())[server]?.token;
}

export async function saveToken(server: string, token: string): Promise<void> {
  await writeCredentials({ ...(await readCredentials()), [server]: { token } });
}

export async function forgetToken(server: string): Promise<void> {
  const { [server]: _, ...rest } = await readCredentials();
  await writeCredentials(rest);
}
