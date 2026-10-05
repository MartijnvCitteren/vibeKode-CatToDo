import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { signOut } from "./auth-actions";

export default async function Home() {
  const userId = await getUserId({ headers: await headers() });
  if (!userId) redirect("/login");
  const user = await db.query.user.findFirst({
    where: { id: userId },
    columns: { name: true },
  });
  if (!user) redirect("/login");

  return (
    <Card
      title={`Hi, ${user.name}`}
      description="Your list is empty. Lissie approves."
    >
      <form action={signOut}>
        <Button type="submit" variant="secondary" className="w-full">
          Sign out
        </Button>
      </form>
    </Card>
  );
}
