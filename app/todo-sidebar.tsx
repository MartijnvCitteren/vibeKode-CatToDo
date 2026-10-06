import type { Todo } from "@todo-cat/contract";

// The user's list next to the chat, read-only: Lissie is the browser's way to change it.
// The page renders it on the server, and the chat refreshes the page after Lissie changes the list.

// A due date is a calendar date, so it is formatted in UTC to keep the day it names.
const dueFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function TodoSidebar({ todos }: { todos: Todo[] }) {
  const open = todos.filter((todo) => !todo.done);
  const done = todos.filter((todo) => todo.done);
  return (
    <aside
      aria-label="Your list"
      className="flex max-h-[40dvh] shrink-0 flex-col gap-6 overflow-y-auto border-t border-zinc-200 bg-white px-4 py-4 lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l dark:border-zinc-800 dark:bg-zinc-950"
    >
      <TodoSection
        title="Open"
        todos={open}
        empty="Nothing open. Lissie suspects you are hiding something."
      />
      <TodoSection
        title="Done"
        todos={done}
        empty="Nothing done yet. Lissie is not surprised."
      />
    </aside>
  );
}

function TodoSection({
  title,
  todos,
  empty,
}: {
  title: string;
  todos: Todo[];
  empty: string;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="flex items-baseline justify-between text-sm font-semibold text-zinc-950 dark:text-zinc-50">
        {title}
        <span className="text-xs font-normal text-zinc-500 tabular-nums dark:text-zinc-400">
          {todos.length}
        </span>
      </h2>
      {todos.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {todos.map((todo) => (
            <li
              key={todo.id}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span
                className={
                  todo.done
                    ? "text-zinc-500 line-through dark:text-zinc-500"
                    : "text-zinc-900 dark:text-zinc-100"
                }
              >
                {todo.title}
              </span>
              {todo.dueDate && !todo.done && (
                <time
                  dateTime={todo.dueDate}
                  className="shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400"
                >
                  {dueFormat.format(new Date(`${todo.dueDate}T00:00:00Z`))}
                </time>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
