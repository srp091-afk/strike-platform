export const integrationProviders = ["telegram", "whatsapp", "instagram", "widget"] as const;

export type IntegrationProvider = (typeof integrationProviders)[number];

export type IntegrationField = {
  name: string;
  label: string;
  secret: boolean;
};

export type IntegrationDefinition = {
  provider: IntegrationProvider;
  title: string;
  description: string;
  fields: readonly IntegrationField[];
};

export const integrationCatalog: readonly IntegrationDefinition[] = [
  {
    provider: "telegram",
    title: "Telegram",
    description: "Подключение ботов через Telegram Bot API",
    fields: [{ name: "botToken", label: "Bot Token", secret: true }],
  },
  {
    provider: "whatsapp",
    title: "WhatsApp Business",
    description: "Несколько номеров Green API. У каждого номера свой агент.",
    fields: [],
  },
  {
    provider: "instagram",
    title: "Instagram Direct",
    description: "Автоматизация ответов в Direct и реакций на сторис",
    fields: [
      { name: "pageId", label: "Page ID", secret: false },
      { name: "accessToken", label: "Meta App Token", secret: true },
    ],
  },
  {
    provider: "widget",
    title: "Web Widget",
    description: "Плавающий чат на сайте клиента",
    fields: [],
  },
];

/** Подписи каналов для списков и шапок. Новый канал — новая строка здесь. */
export const channelLabels = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  widget: "Web Widget",
  unknown: "Канал",
} as const satisfies Record<IntegrationProvider | "unknown", string>;

export function channelLabel(provider: string) {
  return provider in channelLabels ? channelLabels[provider as keyof typeof channelLabels] : channelLabels.unknown;
}

export type IntegrationView = {
  id: string;
  provider: IntegrationProvider;
  agentId: string | null;
  active: boolean;
  hasCredentials: boolean;
};

export function isIntegrationProvider(value: string): value is IntegrationProvider {
  return integrationProviders.includes(value as IntegrationProvider);
}

export function integrationDefinition(provider: IntegrationProvider) {
  return integrationCatalog.find((item) => item.provider === provider) ?? integrationCatalog[0];
}
