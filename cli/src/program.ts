import { todoStatusSchema } from "@todo-cat/contract";
import { Command, CommanderError, Option } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { notLoggedIn, todoApi } from "./api";
import { login, logout, whoami } from "./auth";
import {
  credentialsFile,
  DEFAULT_SERVER_URL,
  readToken,
  serverUrl,
} from "./config";
import { CliError, exitCodes } from "./errors";
import { formatTodo, formatTodos, formatUserCode } from "./format";

// The command tree (see tech-docs/cli.md). Actions write results to stdout and throw CliError;
// `run` turns errors into stderr output and an exit code. Nothing here ever prompts.

const examples = (...lines: string[]) =>
  `\nExamples:\n${lines.map((line) => `  $ todo-cat ${line}`).join("\n")}\n`;

const rootHelp = `${examples(
  "login",
  'add "Buy tuna" --due 2026-10-31',
  "list --status open --json",
  "done 0b7f3c1e-…",
  "delete 0b7f3c1e-… --yes",
)}
Environment:
  TODO_CAT_URL         server URL (default ${DEFAULT_SERVER_URL})
  TODO_CAT_CONFIG_DIR  where the login token is kept (default ~/.config/todo-cat)

Errors go to stderr as "error: <message> (<code>)", or as
{"error":{"code":"…","message":"…"}} with --json.

Exit codes:
  0  success
${exitCodes.map(({ exit, meaning, codes }) => `  ${exit}  ${meaning}: ${codes.join(", ")}`).join("\n")}
`;

/** What every action needs: where to print, which server, and the REST client. */
function context(command: Command) {
  const json = Boolean(command.optsWithGlobals().json);
  const server = serverUrl();
  return {
    server,
    /** Prints `value` as JSON with --json, else the human-readable `text`. */
    print(value: unknown, text: string) {
      process.stdout.write(`${json ? JSON.stringify(value, null, 2) : text}\n`);
    },
    // The token is read only after the input passed its schema, so bad input fails even when logged out.
    api: todoApi(server, async () => {
      const token = await readToken(server);
      if (!token) throw notLoggedIn(server);
      return token;
    }),
  };
}

function printError(code: string, message: string, json: boolean) {
  process.stderr.write(
    json
      ? `${JSON.stringify({ error: { code, message } })}\n`
      : `error: ${message} (${code})\n`,
  );
}

// Commander copies exit and output settings to subcommands when they are created, so they come first.
function buildProgram(json: boolean): Command {
  const program = new Command("todo-cat")
    .exitOverride()
    .configureOutput({
      // Usage errors happen before options are parsed, so JSON mode comes from argv.
      outputError: (message, write) =>
        json
          ? printError("usage", message.replace(/^error: /, "").trim(), true)
          : write(message),
    })
    .description(
      "Keep your todo-cat list from the terminal. Lissie is watching.",
    )
    .version(packageJson.version)
    .option(
      "--json",
      "print results as JSON on stdout, errors as JSON on stderr",
    )
    .configureHelp({ showGlobalOptions: true })
    .showHelpAfterError(
      !json && "(run with --help for usage, examples and exit codes)",
    )
    .addHelpText("after", rootHelp);

  program
    .command("login")
    .description(
      "log in by approving a one-time code in the browser (no browser is opened)",
    )
    .addHelpText(
      "after",
      `\nPrints a code and a URL on stderr, then waits until a signed-in user approves the code
at that URL. Agents: run it in the background and show the code to your human.
${examples("login", "login --json")}`,
    )
    .action(async (_options, command: Command) => {
      const ctx = context(command);
      const user = await login(ctx.server, (code) => {
        process.stderr.write(
          `! Open ${code.verificationUri} and enter the code ${formatUserCode(code.userCode)}\n` +
            `  (or open ${code.verificationUriComplete}); it expires in ${Math.round(code.expiresInSeconds / 60)} minutes.\n` +
            "Waiting for approval…\n",
        );
      });
      ctx.print(
        { server: ctx.server, user },
        `Logged in to ${ctx.server} as ${user.name} <${user.email}>.`,
      );
    });

  program
    .command("logout")
    .description("revoke the session on the server and delete the stored token")
    .addHelpText("after", examples("logout"))
    .action(async (_options, command: Command) => {
      const ctx = context(command);
      const loggedOut = await logout(ctx.server);
      ctx.print(
        { server: ctx.server, loggedOut },
        loggedOut
          ? `Logged out of ${ctx.server}.`
          : `Not logged in to ${ctx.server}; nothing to do.`,
      );
    });

  program
    .command("whoami")
    .description("show the logged-in user (exit code 3 when not logged in)")
    .addHelpText("after", examples("whoami", "whoami --json"))
    .action(async (_options, command: Command) => {
      const ctx = context(command);
      const user = await whoami(ctx.server);
      ctx.print(
        { server: ctx.server, user },
        `Logged in to ${ctx.server} as ${user.name} <${user.email}>.\nToken: ${credentialsFile()}`,
      );
    });

  program
    .command("list")
    .description("list todos, open before done, then by due date")
    .addOption(
      new Option("-s, --status <status>", "which todos to show")
        .choices(todoStatusSchema.options)
        .default("all"),
    )
    .option("--search <text>", "only todos whose title contains this text")
    .addHelpText(
      "after",
      examples("list", "list --status open", "list --search tuna --json"),
    )
    .action(
      async (
        options: { status: "open" | "done" | "all"; search?: string },
        command: Command,
      ) => {
        const ctx = context(command);
        const todos = await ctx.api.list(options);
        ctx.print(todos, formatTodos(todos));
      },
    );

  program
    .command("show")
    .description("show one todo")
    .argument("<id>", "todo id")
    .addHelpText("after", examples("show 0b7f3c1e-… --json"))
    .action(async (id: string, _options, command: Command) => {
      const ctx = context(command);
      const todo = await ctx.api.get(id);
      ctx.print(todo, formatTodo(todo));
    });

  program
    .command("add")
    .description("add a todo")
    .argument("<title>", "what to do (quote it when it has spaces)")
    .option("--due <date>", "due date, yyyy-mm-dd")
    .addHelpText(
      "after",
      examples(
        'add "Buy tuna"',
        'add "Vet appointment" --due 2026-11-03 --json',
      ),
    )
    .action(
      async (title: string, options: { due?: string }, command: Command) => {
        const ctx = context(command);
        const todo = await ctx.api.add({
          title,
          dueDate: options.due,
        });
        ctx.print(todo, `Added: ${formatTodo(todo)}`);
      },
    );

  program
    .command("edit")
    .description("change a todo's title or due date")
    .argument("<id>", "todo id")
    .option("--title <title>", "new title")
    .option("--due <date>", "new due date, yyyy-mm-dd")
    .option("--no-due", "remove the due date")
    .addHelpText(
      "after",
      examples(
        'edit 0b7f3c1e-… --title "Buy salmon"',
        "edit 0b7f3c1e-… --due 2026-11-01",
        "edit 0b7f3c1e-… --no-due",
      ),
    )
    .action(
      async (
        id: string,
        options: { title?: string; due?: string | false },
        command: Command,
      ) => {
        const ctx = context(command);
        const todo = await ctx.api.update(id, {
          title: options.title,
          dueDate: options.due === false ? null : options.due,
        });
        ctx.print(todo, `Updated: ${formatTodo(todo)}`);
      },
    );

  program
    .command("done")
    .description("mark a todo done")
    .argument("<id>", "todo id")
    .addHelpText("after", examples("done 0b7f3c1e-…"))
    .action(async (id: string, _options, command: Command) => {
      const ctx = context(command);
      const todo = await ctx.api.update(id, { done: true });
      ctx.print(todo, `Done: ${formatTodo(todo)}`);
    });

  program
    .command("reopen")
    .description("mark a done todo open again")
    .argument("<id>", "todo id")
    .addHelpText("after", examples("reopen 0b7f3c1e-…"))
    .action(async (id: string, _options, command: Command) => {
      const ctx = context(command);
      const todo = await ctx.api.update(id, { done: false });
      ctx.print(todo, `Reopened: ${formatTodo(todo)}`);
    });

  program
    .command("delete")
    .description("delete a todo for good (requires --yes)")
    .argument("<id>", "todo id")
    .option("--yes", "confirm the deletion; without it nothing is deleted")
    .addHelpText("after", examples("delete 0b7f3c1e-… --yes"))
    .action(
      async (id: string, options: { yes?: boolean }, command: Command) => {
        const ctx = context(command);
        if (!options.yes) {
          throw new CliError(
            "confirmation-required",
            `Deleting is permanent; add --yes to delete ${id}`,
          );
        }
        await ctx.api.remove(id);
        ctx.print({ id, deleted: true }, `Deleted ${id}.`);
      },
    );

  return program;
}

/** Runs the CLI on `argv` (without node and script) and returns the exit code. */
export async function run(argv: string[]): Promise<number> {
  const json = argv.includes("--json");
  const program = buildProgram(json);

  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      // Help and version exit 0; every other Commander error is a usage error, already printed.
      return error.exitCode === 0 ? 0 : 2;
    }
    if (error instanceof CliError) {
      printError(error.code, error.message, json);
      return error.exitCode;
    }
    printError("internal-error", String(error), json);
    return 1;
  }
}
