import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { TextLink } from "@/components/ui/text-link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in · todo-cat" };

export default function LoginPage() {
  return (
    <Card title="Log in" description="Lissie has been guarding your list.">
      <LoginForm />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No account yet? <TextLink href="/signup">Sign up</TextLink>
      </p>
    </Card>
  );
}
