"use client";

import { useActionState } from "react";
import { type AuthFormState, signUp } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { FormError } from "@/components/ui/form-error";

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signUp,
    {},
  );
  return (
    <Form action={action}>
      <input type="hidden" name="next" value={next} />
      <Field
        label="Name"
        name="name"
        autoComplete="name"
        defaultValue={state.name}
        required
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.email}
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <FormError message={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Signing up…" : "Sign up"}
      </Button>
    </Form>
  );
}
