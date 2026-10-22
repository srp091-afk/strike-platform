import "server-only";

/**
 * Отправка уведомления менеджеру. Никогда не бросает: любая ошибка Telegram API
 * (бота удалили из группы, сеть, таймаут) возвращается как { ok: false }, чтобы
 * вызывающий код (notify_manager) мог мягко пропустить уведомление и не ронять
 * генерацию ответа клиенту.
 */
export async function sendTelegramNotification(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const target = chatId.trim();
  if (!token || !target) {
    const error = token ? "У агента не указан telegram_chat_id." : "TELEGRAM_BOT_TOKEN не задан.";
    console.warn("[telegram-notify]", error);
    return { ok: false as const, error };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: target,
        text: text.slice(0, 4000),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const payload = (await response.json().catch(() => null)) as { description?: string } | null;
    if (!response.ok) {
      const error = payload?.description || `Telegram ${response.status}`;
      console.error("[telegram-notify]", error);
      return { ok: false as const, error };
    }

    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отправить уведомление в Telegram.";
    console.error("[telegram-notify]", message);
    return { ok: false as const, error: message };
  }
}
