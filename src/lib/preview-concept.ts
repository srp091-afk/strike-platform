/**
 * Universal master payload for live style previews in the slider.
 *
 * Real creative templates (Style1…Style5) are rendered with this abstract
 * premium concept on local background assets — no generation API calls,
 * so the wizard / refresh modal open instantly.
 */
export const UNIVERSAL_PREVIEW_CONCEPT = {
  /** [before/dark, after/bright] — split styles use both, single styles use [0]. */
  image_urls: ["/assets/master-preview-bg.jpg", "/assets/master-preview-bg-2.jpg"],
  badge: "УТП / ТРИГГЕР",
  headline: "ГЛАВНЫЙ АКЦЕНТНЫЙ ЗАГОЛОВОК",
  subheadline: "Раскрытие оффера или ключевая выгода в одно предложение",
  bullets: [
    "Первое твердое преимущество",
    "Второй важный факт или цифра",
    "Третий аргумент или гарантия",
  ],
  vs_comparison: {
    bad_title: "ОБЫЧНЫЙ ПОДХОД",
    bad_bullets: [
      "Проблема или боль 1",
      "Проблема или боль 2",
      "Проблема или боль 3",
      "Проблема или боль 4",
    ],
    good_title: "НАШ СТАНДАРТ",
    good_bullets: [
      "Твердое решение 1",
      "Твердое решение 2",
      "Твердое решение 3",
      "Твердое решение 4",
    ],
  },
  cta: "КНОПКА ДЕЙСТВИЯ",
  accent_color: "#EAB308",
};
