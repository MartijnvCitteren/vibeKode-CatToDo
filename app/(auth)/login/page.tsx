import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { TextLink } from "@/components/ui/text-link";
import { nextPath, withNext } from "@/lib/next-path";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in · todo-cat" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = nextPath((await searchParams).next);
  return (
    <Card title="Log in" description="Lissie has been guarding your list.">
      <LoginForm next={next} />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No account yet?{" "}
        <TextLink href={withNext("/signup", next)}>Sign up</TextLink>
      </p>
    </Card>
  );
}
