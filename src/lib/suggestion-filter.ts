/**
 * Brief suggestion filtering.
 *
 * Chips under the brief input must never offer:
 *  1. exact duplicates of what the user already picked / typed;
 *  2. semantic competitors of an already-picked value — e.g. after
 *     "Гарантия 5 лет" the pool must drop "Гарантия 2 года" / "Гарантия 1 год".
 *
 * Conflicts are detected by word stems (category prefixes), so variants
 * with different numbers/units still collide within their category.
 */

const CATEGORY_STEMS: Record<string, string[]> = {
  guarantee: ["гарант", "warrant", "guarantee"],
  discount: ["скид", "акци", "discount"],
  installment: ["рассроч", "installment"],
  experience: ["опыт", "стаж", "experience"],
  delivery: ["достав", "delivery", "shipping"],
  production: ["производств", "собственное", "manufactur"],
  contract: ["договор", "contract"],
  deadline: ["срок", "дедлайн", "deadline"],
  price: ["стоимост", "price"],
  support: ["поддерж", "support"],
};

/** Lowercase, ё→е, punctuation stripped, whitespace collapsed. */
export function normalizeSuggestionText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(value: string): string[] {
  const normalized = normalizeSuggestionText(value);
  return normalized ? normalized.split(" ") : [];
}

/** Semantic category of a text (by word stems) or null when uncategorized. */
export function suggestionCategory(value: string): string | null {
  const tokens = tokensOf(value);
  if (tokens.length === 0) return null;
  for (const [category, stems] of Object.entries(CATEGORY_STEMS)) {
    if (tokens.some((token) => stems.some((stem) => token.startsWith(stem)))) {
      return category;
    }
  }
  return null;
}

/** Split a draft / field value into picked fragments (",", ";", line breaks, bullets). */
export function splitSelectedTexts(values: string[]): string[] {
  return values
    .flatMap((value) => value.split(/[,;\n•·|]+/))
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Filter the suggestion pool against everything already selected.
 * Recomputed on every draft change, so chips update in real time:
 *  - exact (normalized) duplicates of selected fragments are hidden;
 *  - suggestions contained in / containing a selected fragment are hidden;
 *  - suggestions sharing a semantic category with any selected fragment
 *    are hidden (only the picked variant survives);
 *  - duplicates inside the pool itself are collapsed.
 */
export function filterSuggestions(suggestions: string[], selectedTexts: string[]): string[] {
  const selected = splitSelectedTexts(selectedTexts);
  const selectedNormalized = selected.map(normalizeSuggestionText).filter(Boolean);
  const selectedCategories = new Set(
    selected.map(suggestionCategory).filter((category): category is string => category !== null),
  );

  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const normalized = normalizeSuggestionText(suggestion);
    if (!normalized) return false;
    if (seen.has(normalized)) return false;
    seen.add(normalized);

    // Exact duplicate or text containment with an already-picked fragment.
    if (
      selectedNormalized.some(
        (picked) => picked === normalized || picked.includes(normalized) || normalized.includes(picked),
      )
    ) {
      return false;
    }

    // Semantic / prefix conflict with an already-picked fragment.
    const category = suggestionCategory(suggestion);
    if (category && selectedCategories.has(category)) return false;

    return true;
  });
}
