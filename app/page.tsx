import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { LISSIE_AGENT_ID, lissieThreadId } from "@/lib/lissie";
import { getUserId } from "@/lib/session";
import { listTodos } from "@/lib/todo-service";
import { signOut } from "./auth-actions";
import { LissieChat } from "./lissie-chat";
import { TodoSidebar } from "./todo-sidebar";

export default async function Home() {
  const userId = await getUserId({ headers: await headers() });
  if (!userId) redirect("/login");
  const user = await db.query.user.findFirst({
    where: { id: userId },
    columns: { name: true },
  });
  if (!user) redirect("/login");
  const todos = await listTodos(userId);

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Hi, {user.name}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Lissie keeps your list. Try not to bore her.
            </p>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <LissieChat
            agentId={LISSIE_AGENT_ID}
            threadId={lissieThreadId(userId)}
          />
        </div>
        <TodoSidebar todos={todos} />
      </main>
    </div>
  );
}
