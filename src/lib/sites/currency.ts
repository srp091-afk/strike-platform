/** Валюта по тексту промпта и ответов. Явная иностранная валюта важнее слов «млн» и «тыс». */
export function detectCurrency(source: string): { symbol: string; position: "before" | "after" } {
  const text = source.toLowerCase();
  if (/\$|usd|\bбали\b|дуба[йя]|оаэ|\bсша\b|америк/.test(text)) return { symbol: "$", position: "before" };
  if (/₸|тенге|алматы|астан/.test(text)) return { symbol: "₸", position: "after" };
  if (/€|\bевро\b|европ/.test(text)) return { symbol: "€", position: "after" };
  return { symbol: "₽", position: "after" };
}
