---
name: todo-cat-cli
description: Manage a person's todo-cat to-do list with the `todo-cat` CLI, which lets you list, search, add, edit, complete, reopen and delete todos and answer questions about them. Use it whenever someone asks about their todos, tasks, to-do list or what's due, overdue, done or open, or asks to add, tick off, reschedule, rename or remove something on that list, even if they never say "todo-cat" or "CLI". Don't use it for changing the todo-cat codebase itself.
---

# Managing a to-do list with todo-cat

`todo-cat` is a command-line client for one person's to-do list on a todo-cat server. You act for that person. Each change is visible to them right away and a delete can't be undone, so work carefully: look before you act, and change only what they asked for.

This skill covers workflows and pitfalls, not every flag. **`todo-cat --help` and `todo-cat <command> --help` are the source of truth.** If they disagree with this skill, follow the help output, because it ships with the installed version.

## Running it

- Inside the todo-cat repo the bin isn't on PATH, so run `npx todo-cat …` from the repo root. Elsewhere it may be installed as `todo-cat`. Run `todo-cat --help` once if you aren't sure which commands exist.
- `TODO_CAT_URL` picks the server (default `http://localhost:3000`). Leave it alone unless the person names another server.
- Add `--json` whenever you'll read the output yourself. JSON results go to stdout, and errors go to stderr as `{"error":{"code","message"}}`. The plain text output is meant for people.
- The exit code tells you what to do next: `0` ok, `2` bad input (fix the arguments), `3` not logged in, `4` no such todo, `5` server unreachable (worth one retry, then report it), `1` anything else.

A todo in JSON looks like this:

```json
{"id":"f8fe…","title":"Book the vet","dueDate":"2026-10-03","done":false,
 "createdAt":"2026-09-23T08:00:00.000Z","completedAt":null}
```

## First check the login

Run `todo-cat whoami --json` before anything else. Exit code `0` gives you the user's name and email, and exit code `3` means nobody is logged in to that server or the session has expired.

When the login is missing, the person has to fix it. Tell them so plainly. For example: "You're not logged in to todo-cat. Run `npx todo-cat login`, open the URL it prints and approve the code while you're signed in to todo-cat in your browser." If they'd like you to start it, run `todo-cat login` in the background, because it blocks until someone approves. Pass on the code and URL it prints to stderr, wait until it exits, then confirm with `whoami`.

Don't try to get around the login. Don't approve the code yourself in a browser, create an account, read or write `credentials.json`, call the REST API with a token you found, or touch the database. Those routes either act as someone who hasn't agreed to it or bypass the very permission the login asks for. A missing login means you stop and ask, not that you need a cleverer path.

## Find the todo before you touch it

People refer to todos by what they say, such as "the vet thing" or "the electricity bill". The commands, however, need ids. So:

1. Search: `todo-cat list --search "vet" --json`. If you already fetched the full `list --json` in this session and nothing has changed it since, look the todo up there instead. The search is a case-insensitive substring match on the title. Use a short, distinctive word rather than the person's whole phrase, since "pay the electric bill" won't match "Pay the electricity bill" but "electric" will.
2. If nothing matches, try a synonym or list everything (`list --json`) and look for it yourself. Don't create a new todo just because the search came up empty.
3. If exactly one todo matches, act on its id.
4. If several match, pick one only when the request clearly singles it out (for example "the *open* vet todo" when only one of them is open). Otherwise show the person the candidates and ask.

Never make up, shorten or reuse an id from memory. Copy it from output you got in this session. Once you've acted, mention the todo by its title, not its id. The person thinks in titles.

## Answering questions about the list

For anything beyond "show me my list", get the JSON once and filter it with `jq`:

```bash
todo-cat list --status open --json | jq -r '.[] | "\(.dueDate // "no date")  \(.title)"'
```

Get today's date from the shell (`date +%F`) instead of assuming you know it. Here are some useful filters (`$today` is `date +%F`):

```bash
# overdue: open, with a due date before today
jq --arg today "$today" '[.[] | select(.done | not) | select(.dueDate != null and .dueDate < $today)]'
# due in the next 7 days, today included
jq --arg today "$today" --arg end "$(date -v+7d +%F 2>/dev/null || date -d '+7 days' +%F)" \
  '[.[] | select(.dueDate != null and .dueDate >= $today and .dueDate <= $end)]'
# counts
jq '{open: map(select(.done | not)) | length, done: map(select(.done)) | length}'
```

`dueDate` is a plain `yyyy-mm-dd` calendar date, so comparing the strings sorts correctly. Many todos have no due date (`null`). Mention them when they matter to the question, for example "and 3 open todos have no due date". When asked what's overdue, also mention anything due today, since it becomes overdue tomorrow.

### Which date does the question mean?

A todo has three dates, and a question like "last week" can be about any of them:

| The person asks… | Field | Notes |
|---|---|---|
| what's due, overdue, coming up, "what do I have on Friday" | `dueDate` | calendar date, may be `null` |
| what they added, created or wrote down | `createdAt` | UTC timestamp |
| what they finished, ticked off or got done | `completedAt` | UTC timestamp, `null` while open |

"What did I add last week?" is about `createdAt`, not `dueDate`. "What was due last week?" is about `dueDate`. If the wording really fits more than one, answer the most likely reading and say which one you used.

Settle on concrete dates before filtering, and say them in your answer, e.g. "last week (Mon 28 Sep to Sun 4 Oct)". "Last week" is normally the previous calendar week, Monday to Sunday, not the last seven days. If the person seems to mean otherwise, follow them.

`createdAt` and `completedAt` are UTC timestamps. Convert them to the person's local date before comparing them with calendar days, because a todo added at 00:30 on Monday in Amsterdam still carries Sunday's date in UTC:

```bash
# local creation date of every todo added from Mon 28 Sep to Sun 4 Oct
jq -r --arg from 2026-09-28 --arg to 2026-10-04 '.[]
  | (.createdAt | sub("\\.[0-9]+Z$"; "Z") | fromdate | strflocaltime("%F")) as $day
  | select($day >= $from and $day <= $to) | "\($day)  \(.title)"'
```

`strflocaltime` uses the shell's timezone. If that probably isn't the person's (for example on a remote server), set `TZ`, e.g. `TZ=Europe/Amsterdam jq …`. Use `list --status open` for "added last week and still not done". Use the same pattern with `.completedAt` (after `select(.completedAt != null)`) for "what did I finish".

## Changing todos

- **Add:** `todo-cat add "<title>" [--due yyyy-mm-dd]`. Turn "next Friday" or "by the end of the month" into a real date yourself (`date +%F` for today, `cal` to check weekdays) and tell the person which date you chose. When the phrase allows two readings ("next Friday" on a Monday), use the context to decide (for example, "push back" means later than the current date). Then give the date with its weekday and mention the other reading. Before adding, a quick `list --search` stops you from creating a duplicate of something that's already there.
- **Edit:** `edit <id> --title …`, `--due yyyy-mm-dd`, or `--no-due` to clear the date. `edit` doesn't change the done state.
- **Done / reopen:** `done <id>` and `reopen <id>`. Both are safe to repeat.
- **Several at once:** there's no bulk command. Find all the ids first, check the set matches the request, then loop. Report what changed.

### Deleting is permanent

`delete <id> --yes` removes a todo for good. There is no undo or trash. Delete only when the person asks to delete or remove todos. "I finished X" means `done`, and "clean up my list" isn't a request to delete anything until they confirm what should go. For anything vague or bulk ("delete the old stuff"), list exactly which todos you'd delete and wait for a yes.

Without `--yes`, `delete` refuses with `confirmation-required` (exit 2). That's a safety catch for you, not a hurdle to clear automatically. Add `--yes` only once the person has asked for that deletion.

## Reporting back

Keep it short and in the person's terms: titles, due dates in a readable form and counts. If a command failed, say what failed and what the person can do about it, such as logging in, starting the server or checking the date they gave. Don't silently retry with different arguments until something works.
