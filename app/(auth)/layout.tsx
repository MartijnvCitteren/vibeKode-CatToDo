import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/session";

// Signed-in users have no business on /login or /signup.
export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await getUserId({ headers: await headers() })) redirect("/");
  return children;
}
