"use server";

import { revalidatePath } from "next/cache";

import { setConversationBotActive } from "@/lib/chats";

export async function setChatBotActive(conversationId: string, active: boolean) {
  const result = await setConversationBotActive(conversationId, active);
  if (result.ok) revalidatePath("/chats");
  return result;
}
