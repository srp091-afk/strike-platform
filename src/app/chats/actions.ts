"use server";

import { revalidatePath } from "next/cache";

import { deleteConversation, setConversationBotActive } from "@/lib/chats";

export async function deleteChat(conversationId: string) {
  const result = await deleteConversation(conversationId);
  if (result.ok) revalidatePath("/chats");
  return result;
}

export async function setChatBotActive(conversationId: string, active: boolean) {
  const result = await setConversationBotActive(conversationId, active);
  if (result.ok) revalidatePath("/chats");
  return result;
}
