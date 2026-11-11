import { z } from "zod";

const emailAddress = z
  .string()
  .trim()
  .max(320)
  .refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: "Укажите корректный email для уведомлений.",
  });

/** Настройки письма о лиде. Пустой адрес допустим, только если отправка выключена. */
export const leadEmailSettingsSchema = z
  .object({
    notify_email_enabled: z.boolean(),
    notify_email_address: emailAddress,
  })
  .superRefine((value, ctx) => {
    if (value.notify_email_enabled && !value.notify_email_address) {
      ctx.addIssue({
        code: "custom",
        message: "Укажите email для уведомлений.",
        path: ["notify_email_address"],
      });
    }
  })
  .transform((value) => ({
    notify_email_enabled: value.notify_email_enabled,
    notify_email_address: value.notify_email_address.toLowerCase(),
  }));

export type LeadEmailSettings = z.infer<typeof leadEmailSettingsSchema>;
