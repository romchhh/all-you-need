/** Короткий формат кількості учасників для UI (12500 → 12.5K). */
export function formatMemberCount(count: number): string {
  if (!count || count <= 0) return '';
  if (count >= 1_000_000) {
    const v = (count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1).replace(/\.0$/, '');
    return `${v}M`;
  }
  if (count >= 1000) {
    const v = (count / 1000).toFixed(count >= 10_000 ? 0 : 1).replace(/\.0$/, '');
    return `${v}K`;
  }
  return String(count);
}
