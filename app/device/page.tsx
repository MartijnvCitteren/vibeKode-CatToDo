import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { withNext } from "@/lib/next-path";
import { getUserId } from "@/lib/session";
import { DeviceApproval } from "./device-approval";

export const metadata: Metadata = { title: "Connect the CLI · todo-cat" };

// Where `todo-cat login` sends its user: a signed-in user approves the code the terminal shows.
export default async function DevicePage({
  searchParams,
}: PageProps<"/device">) {
  const { user_code } = await searchParams;
  const userCode = typeof user_code === "string" ? user_code.trim() : "";
  const here = userCode
    ? `/device?${new URLSearchParams({ user_code: userCode })}`
    : "/device";
  if (!(await getUserId({ headers: await headers() }))) {
    redirect(withNext("/login", here));
  }

  if (!userCode) {
    return (
      <Card
        title="Connect the CLI"
        description="Enter the code that todo-cat login printed in your terminal."
      >
        <Form method="get">
          <Field
            label="Code"
            name="user_code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABCD-EFGH"
            required
          />
          <Button type="submit">Continue</Button>
        </Form>
      </Card>
    );
  }

  return (
    <Card
      title="Log in the todo-cat CLI?"
      description="Approve only if your terminal shows this exact code. The CLI gets full access to your todos."
    >
      <p className="rounded-lg bg-zinc-100 py-3 text-center font-mono text-2xl font-semibold tracking-widest text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50">
        {userCode}
      </p>
      <DeviceApproval userCode={userCode} />
    </Card>
  );
}
