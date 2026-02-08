/**
 * Повертає коректний URL для зображення (аватар, лістінг тощо).
 * Для відносних шляхів використовує /api/images/ для коректного завантаження.
 */
export function getResolvedImageUrl(path: string | null | undefined): string {
  if (!path || !path.trim()) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanPath = path.split('?')[0]?.trim() || path;
  const pathWithoutSlash = cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath;
  return pathWithoutSlash ? `/api/images/${pathWithoutSlash}` : '';
}
