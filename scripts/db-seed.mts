// `npm run db:seed`: a demo user with about a dozen todos from the last two weeks, for local development.
// Rerunning resets the demo user's password and todos, so two runs leave the same state.
// Runs under tsx with the react-server condition, so lib/ modules that import `server-only` load.
// @next/env is CommonJS, so Node only offers its default export to ES modules.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

// A known password belongs in a local database only.
if (!process.env.DATABASE_URL?.startsWith("file:")) {
  throw new Error(
    `db:seed only seeds local file: databases, got ${process.env.DATABASE_URL}`,
  );
}

// Imported after the env is loaded, because lib/db.ts and Better Auth read it on load.
const { auth } = await import("../lib/auth");
const { db } = await import("../lib/db");
const { addTodo, deleteTodo, listTodos, updateTodo } = await import(
  "../lib/todo-service"
);

const EMAIL = "demo@todo-cat.dev";
const PASSWORD = "cat-person-2026";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
/** A moment `days` ago, at `hour` o'clock local time, but never in the future. */
const daysAgo = (days: number, hour: number) => {
  const date = new Date(now - days * DAY);
  date.setHours(hour, 0, 0, 0);
  return new Date(Math.min(date.getTime(), now));
};
/** The local calendar date `days` from today, as `yyyy-mm-dd`. */
const dueIn = (days: number) => {
  const date = new Date(now + days * DAY);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const demoTodos: {
  title: string;
  created: Date;
  dueDate?: string;
  completed?: Date;
}[] = [
  {
    title: "Buy tuna for Lissie",
    created: daysAgo(13, 9),
    completed: daysAgo(12, 18),
  },
  {
    title: "Book the vet for Lissie's vaccinations",
    created: daysAgo(12, 10),
    dueDate: dueIn(-2),
  },
  {
    title: "Replace the shredded scratching post",
    created: daysAgo(11, 20),
    completed: daysAgo(9, 11),
  },
  {
    title: "Order more cat litter",
    created: daysAgo(10, 8),
    dueDate: dueIn(0),
  },
  {
    title: "Clean the water fountain filter",
    created: daysAgo(9, 19),
    completed: daysAgo(8, 7),
  },
  { title: "Call Mom back", created: daysAgo(8, 12) },
  { title: "Renew passport", created: daysAgo(7, 14), dueDate: dueIn(21) },
  {
    title: "Fix the leaking kitchen tap",
    created: daysAgo(6, 21),
    completed: daysAgo(3, 10),
  },
  {
    title: "Find a cat sitter for the weekend trip",
    created: daysAgo(5, 9),
    dueDate: dueIn(5),
  },
  {
    title: "Pay the electricity bill",
    created: daysAgo(4, 17),
    dueDate: dueIn(1),
    completed: daysAgo(2, 9),
  },
  { title: "Read the cat behaviour book", created: daysAgo(3, 22) },
  {
    title: "Water the plants Lissie hasn't eaten yet",
    created: daysAgo(1, 8),
    dueDate: dueIn(2),
  },
  {
    title: "Return the library books",
    created: daysAgo(0, 7),
    dueDate: dueIn(7),
  },
];

const ctx = await auth.$context;
const existing = await ctx.internalAdapter.findUserByEmail(EMAIL);
let userId: string;
if (existing) {
  userId = existing.user.id;
  await ctx.internalAdapter.updatePassword(
    userId,
    await ctx.password.hash(PASSWORD),
  );
  for (const todo of await listTodos(userId)) await deleteTodo(userId, todo.id);
} else {
  const { user } = await auth.api.signUpEmail({
    body: { name: "Demo", email: EMAIL, password: PASSWORD },
  });
  userId = user.id;
}

for (const { title, created, dueDate, completed } of demoTodos) {
  const todo = await addTodo(userId, { title, dueDate }, created);
  if (completed) await updateTodo(userId, todo.id, { done: true }, completed);
}

db.$client.close();
console.log(
  `Seeded ${demoTodos.length} todos for ${EMAIL} (password ${PASSWORD})`,
);
