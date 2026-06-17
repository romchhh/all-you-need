export const LISTING_TITLE_MAX_LENGTH = 100;
export const LISTING_DESCRIPTION_MAX_LENGTH = 4000;
export const TELEGRAM_CAPTION_LIMIT = 1024;
export const LISTING_MAX_PHOTOS = 10;
export const LISTING_MAX_FILE_SIZE = 5 * 1024 * 1024;

export function calculateTelegramCaptionLength(title: string, description: string): number {
  return `${title}\n\n${description}`.trim().length;
}
