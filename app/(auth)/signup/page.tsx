import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { TextLink } from "@/components/ui/text-link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up · todo-cat" };

export default function SignupPage() {
  return (
    <Card
      title="Sign up"
      description="Lissie will keep your to-dos. She has opinions about them."
    >
      <SignupForm />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account? <TextLink href="/login">Log in</TextLink>
      </p>
    </Card>
  );
}
