"use server";

import { revalidatePath } from "next/cache";

import { deleteConversation, setConversationBotActive } from "@/lib/chats";
import { sendOperatorReply } from "@/lib/operator-reply";

export async function deleteChat(conversationId: string) {
  const result = await deleteConversation(conversationId);
  if (result.ok) revalidatePath("/chats");
  return result;
}

export async function replyToChat(conversationId: string, text: string) {
  return sendOperatorReply(conversationId, text);
}

export async function setChatBotActive(conversationId: string, active: boolean) {
  // Do not revalidatePath here: a full /chats refresh races the optimistic Switch
  // and the 4s inbox poll, making the toggle feel sticky / needing two clicks.
  return setConversationBotActive(conversationId, active);
}
