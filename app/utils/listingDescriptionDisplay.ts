/**
 * Опис з парсера: @username → лише блок «Продавець»; без username → лінк на оригінал у тексті.
 */

const AUTHOR_LINE_RE =
  /(?:^|\n)\s*👤\s*(?:Автор|Author):\s*@[\w\d_]+\s*/gi;

const ORIGINAL_LINK_LINE_RE =
  /(?:^|\n)\s*🔗\s*(?:Оригінальне [\u043eо]голошення|Оригинальное объявление|Original(?:\s+(?:post|listing|ad))?)\s*:[^\n]*/giu;

function hasAuthorUsernameInDescription(text: string): boolean {
  return /👤\s*(?:Автор|Author):\s*@[\w\d_]+/i.test(text);
}

/** Чи показувати в описі посилання на оригінальний пост (немає @ продавця). */
export function shouldShowOriginalPostInDescription(
  description: string,
  sellerUsername?: string | null
): boolean {
  if ((sellerUsername || '').trim()) return false;
  if (hasAuthorUsernameInDescription(description)) return false;
  if (/🔗\s*(?:Оригінальне|Оригинальное|Original)/iu.test(description)) return true;
}

/** Текст опису для UI: прибираємо дубль автора; лінк на оригінал — лише без username. */
export function formatListingDescriptionForDisplay(
  description: string,
  sellerUsername?: string | null
): string {
  let text = (description || '').trim();
  if (!text) return '';

  text = text.replace(AUTHOR_LINE_RE, '\n');

  const hideOriginal =
    Boolean((sellerUsername || '').trim()) || hasAuthorUsernameInDescription(description);

  if (hideOriginal) {
    text = text.replace(ORIGINAL_LINK_LINE_RE, '\n');
  }

  return text.replace(/\n{3,}/g, '\n\n').trim();
}
