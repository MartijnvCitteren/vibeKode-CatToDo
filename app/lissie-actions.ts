"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { startLissieThread } from "@/lib/lissie";
import { getUserId } from "@/lib/session";

/** Starts a new conversation with Lissie; the refreshed page hands the chat its thread. */
export async function startNewConversation() {
  const userId = await getUserId({ headers: await headers() });
  if (!userId) redirect("/login");
  await startLissieThread(userId);
  refresh();
}
