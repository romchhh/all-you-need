/**
 * URL для відображення фото оголошення у веб-додатку.
 */
export function buildListingImageUrl(imagePath: string | null | undefined): string {
  if (!imagePath) return '';
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  const cleanPath = (imagePath.split('?')[0] || imagePath).replace(/^\/+/, '');
  if (!cleanPath) return '';

  if (cleanPath.includes('parsed_photos')) {
    const match = cleanPath.match(/(?:^|\/)parsed_photos\/(.+)$/);
    return match?.[1] ? `/api/parsed-images/${match[1]}` : '';
  }

  if (cleanPath.startsWith('api/images/')) {
    return `/${cleanPath}`;
  }

  return `/api/images/${cleanPath}`;
}
