export type CreativeTemplate = {
  id: string;
  name: string;
  category: string;
  preview_url: string;
  system_prompt: string;
  is_active: boolean;
};

export const templateCategories = ["Все", "Минимализм", "Агрессивный маркетинг", "Премиум"] as const;

export const creativeTemplates: CreativeTemplate[] = [
  {
    id: "minimal-type",
    name: "Тихая типографика",
    category: "Минимализм",
    preview_url:
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=640&h=800&q=70",
    system_prompt:
      "Минималистичные макеты: много воздуха, одна короткая фраза, тонкая типографика, без стоковых лиц и декоративного шума.",
    is_active: true,
  },
  {
    id: "hard-offer",
    name: "Жёсткий оффер",
    category: "Агрессивный маркетинг",
    preview_url:
      "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=640&h=800&q=70",
    system_prompt:
      "Контрастные макеты прямого отклика: крупная цифра оффера, короткий дедлайн, один призыв, без мягких формулировок.",
    is_active: true,
  },
  {
    id: "black-luxury",
    name: "Чёрный люкс",
    category: "Премиум",
    preview_url:
      "https://images.unsplash.com/photo-1618556450994-a6a128ef0d9d?auto=format&fit=crop&w=640&h=800&q=70",
    system_prompt:
      "Премиальные макеты: тёмный фон, мало текста, дорогая фактура, ощущение редкости и спокойной уверенности.",
    is_active: true,
  },
  {
    id: "hard-contrast",
    name: "Прямой контраст",
    category: "Агрессивный маркетинг",
    preview_url:
      "https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=640&h=800&q=70",
    system_prompt:
      "Макеты с резким контрастом: боль клиента против конкретного результата, крупный заголовок и одна выгода.",
    is_active: true,
  },
];

export function findCreativeTemplate(id: string) {
  return creativeTemplates.find((template) => template.id === id && template.is_active) ?? null;
}
