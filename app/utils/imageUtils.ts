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

/** Стискає зображення на клієнті перед завантаженням (canvas). */
export async function compressImageOnClient(
  file: File,
  maxSizeMB: number = 2
): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1920;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          if (width > height) {
            height = (height / width) * MAX_WIDTH;
            width = MAX_WIDTH;
          } else {
            width = (width / height) * MAX_HEIGHT;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.8;
        const estimatedSize = (width * height * 4) / 1024 / 1024;

        if (estimatedSize > maxSizeMB) {
          quality = Math.max(0.5, (maxSizeMB / estimatedSize) * 0.8);
        }

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            resolve(
              new File([blob], safeImageFileName(file.name, 'jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now(),
              })
            );
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** ASCII name so Safari/undici FormData does not throw pattern-mismatch. */
export function safeImageFileName(originalName: string | undefined, ext = 'jpg'): string {
  const base = (originalName || 'photo')
    .split(/[/\\]/)
    .pop()
    ?.replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'photo'}.${ext}`;
}

function sanitizeImageMime(type: string | undefined): string {
  const raw = (type || '').split(';')[0].trim().toLowerCase();
  if (raw === 'image/jpg') return 'image/jpeg';
  if (/^image\/[a-z0-9.+-]+$/.test(raw)) return raw;
  return 'image/jpeg';
}

/**
 * Converts a gallery/camera file into a JPEG Blob that Telegram WebView and
 * Node formData() can parse. Must run before the file input is unmounted.
 */
export async function toSafeListingUploadFile(file: File, index: number): Promise<File> {
  const name = `listing-${Date.now()}-${index}.jpg`;
  try {
    const compressed = await compressImageOnClient(file, 2);
    return new File([compressed], name, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn('[toSafeListingUploadFile] compress failed, wrapping original', error);
    const bytes = await file.arrayBuffer();
    return new File([bytes], name, {
      type: sanitizeImageMime(file.type),
      lastModified: Date.now(),
    });
  }
}

export function isEngineErrorMessage(message: string | undefined | null): boolean {
  if (!message) return true;
  return /did not match the expected pattern|Failed to parse|multipart|formData|Failed to fetch|NetworkError|Load failed|prisma|invalid input syntax|unexpected token/i.test(
    message
  );
}
