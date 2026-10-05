"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { nextPath } from "@/lib/next-path";

// What the login and signup forms get back when Better Auth refuses: the message plus what to refill.
export type AuthFormState = { error?: string; name?: string; email?: string };

const text = (formData: FormData, key: string) =>
  String(formData.get(key) ?? "");

// Runs a Better Auth call and turns its refusals into form state; nextCookies sets the session cookie on success.
async function attempt(
  call: () => Promise<unknown>,
  refill: AuthFormState,
): Promise<AuthFormState | undefined> {
  try {
    await call();
  } catch (error) {
    if (isAPIError(error)) return { ...refill, error: error.message };
    throw error;
  }
}

// Both forms carry a hidden `next` (e.g. /device?user_code=…) to return to after success.
export async function signUp(
  _: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const body = {
    name: text(formData, "name"),
    email: text(formData, "email"),
    password: text(formData, "password"),
  };
  const failed = await attempt(() => auth.api.signUpEmail({ body }), {
    name: body.name,
    email: body.email,
  });
  if (failed) return failed;
  redirect(nextPath(text(formData, "next")));
}

export async function signIn(
  _: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const body = {
    email: text(formData, "email"),
    password: text(formData, "password"),
  };
  const failed = await attempt(() => auth.api.signInEmail({ body }), {
    email: body.email,
  });
  if (failed) return failed;
  redirect(nextPath(text(formData, "next")));
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
