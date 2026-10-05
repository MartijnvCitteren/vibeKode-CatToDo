"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { FormError } from "@/components/ui/form-error";
import { type DeviceState, decideDevice } from "./actions";

const outcomes = {
  approved:
    "The CLI is logged in. Head back to your terminal; Lissie is already there.",
  denied: "Denied. The CLI stays logged out.",
};

export function DeviceApproval({ userCode }: { userCode: string }) {
  const [state, action, pending] = useActionState<DeviceState, FormData>(
    decideDevice,
    {},
  );
  if (state.decision) {
    return (
      <p role="status" className="text-sm text-zinc-800 dark:text-zinc-200">
        {outcomes[state.decision]}
      </p>
    );
  }
  return (
    <Form action={action}>
      <input type="hidden" name="user_code" value={userCode} />
      <FormError message={state.error} />
      <Button type="submit" name="decision" value="approve" disabled={pending}>
        Approve
      </Button>
      <Button
        type="submit"
        name="decision"
        value="deny"
        variant="secondary"
        disabled={pending}
      >
        Deny
      </Button>
    </Form>
  );
}
