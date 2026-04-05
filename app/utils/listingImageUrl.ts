/**
 * URL для відображення фото оголошення у веб-додатку.
 * Шляхи з парсера (database/parsed_photos) не лежать у public — повертаємо ''.
 */
export function buildListingImageUrl(imagePath: string | null | undefined): string {
  if (!imagePath) return '';
  if (imagePath.includes('database/') || imagePath.includes('parsed_photos')) return '';
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  const cleanPath = imagePath.split('?')[0] || imagePath;
  const pathWithoutSlash = cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath;
  return pathWithoutSlash ? `/api/images/${pathWithoutSlash}` : '';
}
