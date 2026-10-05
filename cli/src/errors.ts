import type { ErrorCode } from "@todo-cat/contract";

/** Every error code the CLI reports: the API's own plus the ones only a client runs into. */
export type CliErrorCode =
  | ErrorCode
  | "usage"
  | "confirmation-required"
  | "login-denied"
  | "login-expired"
  | "server-unreachable"
  | "server-error"
  | "unexpected-response"
  | "credentials-unreadable"
  | "internal-error";

/** Exit codes grouped by what a caller should do next; `--help` prints this table. */
export const exitCodes: {
  exit: number;
  meaning: string;
  codes: readonly CliErrorCode[];
}[] = [
  {
    exit: 1,
    meaning: "server or CLI failure",
    codes: [
      "server-error",
      "unexpected-response",
      "credentials-unreadable",
      "internal-error",
    ],
  },
  {
    exit: 2,
    meaning: "invalid arguments or input",
    codes: ["usage", "validation-failed", "confirmation-required"],
  },
  {
    exit: 3,
    meaning: "not logged in, or login failed",
    codes: ["unauthorized", "login-denied", "login-expired"],
  },
  { exit: 4, meaning: "no such todo", codes: ["todo-not-found"] },
  {
    exit: 5,
    meaning: "server unreachable (retryable)",
    codes: ["server-unreachable"],
  },
];

export class CliError extends Error {
  constructor(
    readonly code: CliErrorCode,
    message: string,
  ) {
    super(message);
  }

  get exitCode(): number {
    return (
      exitCodes.find((group) => group.codes.includes(this.code))?.exit ?? 1
    );
  }
}
