"use client";

import { useActionState } from "react";
import { type AuthFormState, signIn } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { FormError } from "@/components/ui/form-error";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signIn,
    {},
  );
  return (
    <Form action={action}>
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
        autoComplete="current-password"
        required
      />
      <FormError message={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </Form>
  );
}
