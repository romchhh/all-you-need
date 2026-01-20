/**
 * Утиліта для надсилання оголошень в групу модерації через Telegram Bot API
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const MODERATION_GROUP_ID = process.env.MODERATION_GROUP_ID;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface ListingData {
  id: number;
  title: string;
  description: string;
  price: string;
  currency?: string;
  category: string;
  subcategory?: string;
  condition?: string;
  location: string;
  images: string | string[];
  username?: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
}

/**
 * Надсилає оголошення в групу модерації
 */
export async function sendListingToModerationGroup(
  listingId: number,
  source: 'marketplace' | 'telegram',
  listingData?: ListingData,
  isEdit?: boolean
): Promise<boolean> {
  if (!MODERATION_GROUP_ID || !BOT_TOKEN) {
    console.warn('MODERATION_GROUP_ID or TELEGRAM_BOT_TOKEN not set');
    return false;
  }

  try {
    console.log('[sendToModerationGroup] Starting:', { listingId, source, hasListingData: !!listingData });
    
    // Якщо дані не передані, отримуємо з БД (для маркетплейсу)
    if (!listingData && source === 'marketplace') {
      const { prisma } = await import('@/lib/prisma');
      const result = await prisma.$queryRawUnsafe(
        `SELECT 
          l.id, l.title, l.description, l.price, l.currency,
          l.category, l.subcategory, l.condition, l.location,
          l.images, l.createdAt,
          u.username, u.firstName, u.lastName
        FROM Listing l
        JOIN User u ON l.userId = u.id
        WHERE l.id = ?`,
        listingId
      ) as any[];

      if (result.length === 0) {
        console.error('[sendToModerationGroup] Listing not found:', listingId);
        return false;
      }

      const firstResult = result[0];
      if (firstResult) {
        listingData = firstResult;
        console.log('[sendToModerationGroup] Listing data retrieved:', {
          listingId,
          title: firstResult.title,
          imagesType: typeof firstResult.images,
          imagesLength: typeof firstResult.images === 'string' ? firstResult.images.length : Array.isArray(firstResult.images) ? firstResult.images.length : 'unknown',
        });
      }
    }

    if (!listingData) {
      console.error('[sendToModerationGroup] Listing data not available');
      return false;
    }

    // Формуємо текст (з пометкою про редагування якщо потрібно)
    const text = formatListingText(listingData, source, listingId, isEdit);

    // Отримуємо зображення
    const images = getImages(listingData.images);
    
    console.log('[sendToModerationGroup] Images processed:', {
      listingId,
      source,
      imagesCount: images.length,
      firstImage: images[0]?.substring(0, 100),
      allImages: images.map(img => img.substring(0, 80)),
    });
    
    // Перевіряємо, чи є зображення
    if (images.length === 0) {
      console.warn('[sendToModerationGroup] No images found for listing:', listingId);
    }

    // Створюємо клавіатуру
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '✅ Схвалити',
            callback_data: `mod_approve_${source}_${listingId}`,
          },
          {
            text: '❌ Відхилити',
            callback_data: `mod_reject_${source}_${listingId}`,
          },
        ],
      ],
    };

    // Обрізаємо текст до 1024 символів (обмеження Telegram для caption)
    const MAX_CAPTION_LENGTH = 1024;
    const truncatedText = truncateText(text, MAX_CAPTION_LENGTH);

    // Надсилаємо оголошення
    if (images.length > 0) {
      // Якщо є фото
      if (images.length === 1) {
        // Одне фото з описом
        // Для маркетплейсу завантажуємо файл та надсилаємо через multipart
        const imageUrl = images[0];
        const isUrl = imageUrl.startsWith('http://') || imageUrl.startsWith('https://');
        
        let response;
        if (isUrl && source === 'marketplace') {
          // Завантажуємо зображення та надсилаємо через multipart/form-data
          try {
            let buffer: Buffer | null = null;
            
            // Спочатку спробуємо прочитати з диска
            // Витягуємо шлях з URL (наприклад, https://tradegrnd.com/listings/file.webp -> /listings/file.webp)
            let localPath: string | null = null;
            
            if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
              // Витягуємо шлях з URL
              try {
                const urlObj = new URL(imageUrl);
                const pathFromUrl = urlObj.pathname; // /listings/file.webp
                localPath = join(process.cwd(), 'public', pathFromUrl);
              } catch (e) {
                // Якщо не вдалося розпарсити URL, спробуємо витягти шлях вручну
                const pathMatch = imageUrl.match(/\/listings\/[^\/]+$/);
                if (pathMatch) {
                  localPath = join(process.cwd(), 'public', pathMatch[0]);
                }
              }
            } else if (imageUrl.startsWith('/')) {
              // Вже відносний шлях
              localPath = join(process.cwd(), 'public', imageUrl);
            }
            
            // Спробуємо прочитати з диска
            if (localPath && existsSync(localPath)) {
              console.log('[sendToModerationGroup] Reading image from disk:', localPath);
              buffer = await readFile(localPath);
            } else {
              // Якщо не знайдено на диску, спробуємо завантажити через HTTP
              // Спочатку спробуємо через API route, якщо це listings
              let fetchUrl = imageUrl;
              // Перевіряємо, чи URL вже містить /api/images/ - якщо так, не додаємо його знову
              if (imageUrl.includes('/listings/') && !imageUrl.includes('/api/images/')) {
                // Конвертуємо URL в API route формат
                // https://tradegrnd.com/listings/file.webp -> https://tradegrnd.com/api/images/listings/file.webp
                try {
                  const urlObj = new URL(imageUrl);
                  const pathFromUrl = urlObj.pathname; // /listings/file.webp
                  const apiRouteUrl = `${urlObj.origin}/api/images${pathFromUrl}`;
                  console.log('[sendToModerationGroup] Trying API route:', apiRouteUrl);
                  fetchUrl = apiRouteUrl;
                } catch (e) {
                  // Якщо не вдалося розпарсити, використовуємо оригінальний URL
                  console.log('[sendToModerationGroup] Failed to parse URL, using original:', imageUrl);
                }
              }
              
              console.log('[sendToModerationGroup] Fetching image via HTTP:', fetchUrl);
              const imageResponse = await fetch(fetchUrl);
              if (!imageResponse.ok) {
                // Якщо API route не спрацював, спробуємо прямий шлях
                if (fetchUrl.includes('/api/images/') && imageUrl !== fetchUrl) {
                  console.log('[sendToModerationGroup] API route failed, trying direct path:', imageUrl);
                  const directResponse = await fetch(imageUrl);
                  if (directResponse.ok) {
                    const imageBuffer = await directResponse.arrayBuffer();
                    buffer = Buffer.from(imageBuffer);
                  } else {
                    throw new Error(`Failed to fetch image: ${directResponse.status} ${directResponse.statusText}`);
                  }
                } else {
                  throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
                }
              } else {
                const imageBuffer = await imageResponse.arrayBuffer();
                buffer = Buffer.from(imageBuffer);
              }
            }
            
            if (!buffer) {
              throw new Error('Failed to load image buffer');
            }
            
            // Створюємо multipart/form-data вручну для Node.js
            const boundary = `----WebKitFormBoundary${Date.now()}${Math.random().toString(36).substring(7)}`;
            const formDataParts: Buffer[] = [];
            
            const appendField = (name: string, value: string) => {
              formDataParts.push(Buffer.from(`--${boundary}\r\n`));
              formDataParts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
              formDataParts.push(Buffer.from(`${value}\r\n`));
            };
            
            const appendFile = (name: string, buffer: Buffer, filename: string, contentType: string) => {
              formDataParts.push(Buffer.from(`--${boundary}\r\n`));
              formDataParts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"; filename="${filename}"\r\n`));
              formDataParts.push(Buffer.from(`Content-Type: ${contentType}\r\n\r\n`));
              formDataParts.push(buffer);
              formDataParts.push(Buffer.from(`\r\n`));
            };
            
            appendFile('photo', buffer, 'image.webp', 'image/webp');
            appendField('chat_id', MODERATION_GROUP_ID!);
            appendField('caption', truncatedText);
            appendField('parse_mode', 'HTML');
            appendField('reply_markup', JSON.stringify(keyboard));
            formDataParts.push(Buffer.from(`--${boundary}--\r\n`));
            
            const formDataBuffer = Buffer.concat(formDataParts);
            
            console.log('[sendToModerationGroup] Sending photo via multipart, size:', formDataBuffer.length);
            response = await fetch(
              `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': `multipart/form-data; boundary=${boundary}`,
                  'Content-Length': formDataBuffer.length.toString(),
                },
                body: formDataBuffer,
              }
            );
          } catch (error) {
            console.error('[sendToModerationGroup] Error loading/sending image:', {
              error,
              imageUrl,
              listingId,
              source,
              message: error instanceof Error ? error.message : String(error),
            });
            // Fallback: надсилаємо як URL (може не спрацювати, але спробуємо)
            response = await fetch(
              `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: MODERATION_GROUP_ID,
                  photo: imageUrl,
                  caption: truncatedText,
                  parse_mode: 'HTML',
                  reply_markup: keyboard,
                }),
              }
            );
          }
        } else {
          // Для Telegram file_id або якщо це не URL
          response = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: MODERATION_GROUP_ID,
                photo: imageUrl,
                caption: truncatedText,
                parse_mode: 'HTML',
                reply_markup: keyboard,
              }),
            }
          );
        }

        if (!response.ok) {
          const errorText = await response.text();
          let error;
          try {
            error = JSON.parse(errorText);
          } catch {
            error = { description: errorText };
          }
          console.error('Telegram API error (sendPhoto):', {
            error,
            listingId,
            source,
            imageUrl: images[0],
            captionLength: truncatedText.length,
          });
          return false;
        }
      } else {
        // Кілька фото - надсилаємо медіа-групу
        // Для маркетплейсу завантажуємо зображення та надсилаємо через multipart
        if (source === 'marketplace' && images.some(img => img.startsWith('http') || img.startsWith('/'))) {
          // Завантажуємо всі зображення та надсилаємо через sendMediaGroup з файлами
          try {
            const webappUrl = process.env.WEBAPP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            
            // Завантажуємо всі зображення
            const imageBuffers: Array<{ buffer: Buffer; fullUrl: string } | null> = [];
            for (let i = 0; i < images.length; i++) {
              const img = images[i];
              
              try {
                let buffer: Buffer | null = null;
                let localPath: string | null = null;
                
                // Спочатку спробуємо прочитати з диска
                if (img.startsWith('http://') || img.startsWith('https://')) {
                  // Витягуємо шлях з URL
                  try {
                    const urlObj = new URL(img);
                    const pathFromUrl = urlObj.pathname; // /listings/file.webp або /api/images/listings/file.webp
                    // Якщо це API route, витягаємо оригінальний шлях
                    const actualPath = pathFromUrl.startsWith('/api/images/') 
                      ? pathFromUrl.replace('/api/images/', '/') 
                      : pathFromUrl;
                    localPath = join(process.cwd(), 'public', actualPath);
                  } catch (e) {
                    // Якщо не вдалося розпарсити URL, спробуємо витягти шлях вручну
                    const pathMatch = img.match(/\/listings\/[^\/]+$/);
                    if (pathMatch) {
                      localPath = join(process.cwd(), 'public', pathMatch[0]);
                    }
                  }
                } else if (img.startsWith('/')) {
                  // Вже відносний шлях з початковим слешем
                  localPath = join(process.cwd(), 'public', img);
                } else if (img.includes('listings/')) {
                  // Шлях без початкового слеша (наприклад: listings/file.webp)
                  localPath = join(process.cwd(), 'public', '/' + img);
                }
                
                // Спробуємо прочитати з диска
                if (localPath && existsSync(localPath)) {
                  console.log(`[sendToModerationGroup] Reading image ${i} from disk:`, localPath);
                  buffer = await readFile(localPath);
                  imageBuffers.push({ buffer, fullUrl: img });
                } else {
                  // Якщо не знайдено на диску, спробуємо завантажити через HTTP
                  let fetchUrl: string;
                  
                  if (img.startsWith('http')) {
                    // Вже повний URL
                    fetchUrl = img;
                    // Якщо це API route URL, спробуємо його напряму
                    if (fetchUrl.includes('/api/images/')) {
                      // Залишаємо як є
                    } else if (fetchUrl.includes('/listings/')) {
                      // Конвертуємо в API route
                      try {
                        const urlObj = new URL(fetchUrl);
                        const pathFromUrl = urlObj.pathname; // /listings/file.webp
                        fetchUrl = `${urlObj.origin}/api/images${pathFromUrl}`;
                      } catch (e) {
                        // Якщо не вдалося розпарсити, використовуємо оригінальний
                      }
                    }
                  } else {
                    // Відносний шлях - формуємо правильний URL
                    const pathWithSlash = img.startsWith('/') ? img : '/' + img;
                    // Завжди використовуємо API route для зображень з listings
                    if (pathWithSlash.includes('/listings/')) {
                      fetchUrl = `${webappUrl}/api/images${pathWithSlash}`;
                    } else {
                      fetchUrl = `${webappUrl}${pathWithSlash}`;
                    }
                  }
                  
                  console.log(`[sendToModerationGroup] Image ${i} not found on disk, trying HTTP:`, fetchUrl);
                  const imageResponse = await fetch(fetchUrl);
                  if (imageResponse.ok) {
                    const imageBuffer = await imageResponse.arrayBuffer();
                    buffer = Buffer.from(imageBuffer);
                    imageBuffers.push({ buffer, fullUrl: img });
                  } else {
                    // Якщо API route не спрацював, спробуємо прямий шлях
                    if (fetchUrl.includes('/api/images/') && img !== fetchUrl && img.startsWith('http')) {
                      console.log(`[sendToModerationGroup] Image ${i} API route failed, trying direct:`, img);
                      const directResponse = await fetch(img);
                      if (directResponse.ok) {
                        const imageBuffer = await directResponse.arrayBuffer();
                        buffer = Buffer.from(imageBuffer);
                        imageBuffers.push({ buffer, fullUrl: img });
                      } else {
                        console.warn(`[sendToModerationGroup] Failed to load image ${i}: ${directResponse.status}`);
                        imageBuffers.push(null);
                      }
                    } else {
                      console.warn(`[sendToModerationGroup] Failed to load image ${i}: ${imageResponse.status}`);
                      imageBuffers.push(null);
                    }
                  }
                }
              } catch (error) {
                console.error(`[sendToModerationGroup] Error loading image ${i}:`, error);
                imageBuffers.push(null);
              }
            }
            
            // Створюємо multipart/form-data вручну
            const boundary = `----WebKitFormBoundary${Date.now()}${Math.random().toString(36).substring(7)}`;
            const formDataParts: Buffer[] = [];
            
            const appendField = (name: string, value: string) => {
              formDataParts.push(Buffer.from(`--${boundary}\r\n`));
              formDataParts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
              formDataParts.push(Buffer.from(`${value}\r\n`));
            };
            
            const appendFile = (name: string, buffer: Buffer, filename: string, contentType: string) => {
              formDataParts.push(Buffer.from(`--${boundary}\r\n`));
              formDataParts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"; filename="${filename}"\r\n`));
              formDataParts.push(Buffer.from(`Content-Type: ${contentType}\r\n\r\n`));
              formDataParts.push(buffer);
              formDataParts.push(Buffer.from(`\r\n`));
            };
            
            // Створюємо media array з attach:// для завантажених файлів
            // Пропускаємо зображення, які не завантажилися
            const mediaArray: any[] = [];
            const loadedBuffers: Array<{ buffer: Buffer; index: number }> = [];
            for (let i = 0; i < images.length; i++) {
              if (imageBuffers[i]) {
                const attachName = `photo_${i}`;
                appendFile(attachName, imageBuffers[i]!.buffer, `image_${i}.webp`, 'image/webp');
                loadedBuffers.push({ buffer: imageBuffers[i]!.buffer, index: i });
                mediaArray.push({
                  type: 'photo',
                  media: `attach://${attachName}`,
                  caption: loadedBuffers.length === 1 ? truncatedText : undefined,
                  parse_mode: loadedBuffers.length === 1 ? 'HTML' : undefined,
                });
              }
              // Пропускаємо зображення, які не завантажилися (502 або інші помилки)
            }
            
            // Якщо є хоча б одне завантажене зображення, надсилаємо медіа-групу
            let mediaSent = false;
            if (mediaArray.length > 0) {
              appendField('chat_id', MODERATION_GROUP_ID!);
              appendField('media', JSON.stringify(mediaArray));
              formDataParts.push(Buffer.from(`--${boundary}--\r\n`));
              
              const formDataBuffer = Buffer.concat(formDataParts);
              
              const mediaResponse = await fetch(
                `https://api.telegram.org/bot${BOT_TOKEN}/sendMediaGroup`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': formDataBuffer.length.toString(),
                  },
                  body: formDataBuffer,
                }
              );
              
              if (mediaResponse.ok) {
                mediaSent = true;
              } else {
                const errorText = await mediaResponse.text();
                let error;
                try {
                  error = JSON.parse(errorText);
                } catch {
                  error = { description: errorText };
                }
                console.error('Telegram API error (media group with files):', {
                  error,
                  listingId,
                  source,
                  mediaCount: mediaArray.length,
                });
                
                // Fallback: надсилаємо як URL (може не спрацювати)
                const fallbackMedia = mediaArray.map((item, i) => {
                  const img = images[loadedBuffers[i]?.index || i];
                  const fallbackUrl = img.startsWith('http') 
                    ? img 
                    : `${webappUrl}${img.startsWith('/') ? img : '/' + img}`;
                  return {
                    type: 'photo',
                    media: fallbackUrl,
                    caption: i === 0 ? truncatedText : undefined,
                    parse_mode: i === 0 ? 'HTML' : undefined,
                  };
                });
                
                const fallbackResponse = await fetch(
                  `https://api.telegram.org/bot${BOT_TOKEN}/sendMediaGroup`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      chat_id: MODERATION_GROUP_ID,
                      media: fallbackMedia,
                    }),
                  }
                );
                
                if (fallbackResponse.ok) {
                  mediaSent = true;
                } else {
                  // Якщо і fallback не спрацював, надсилаємо тільки текст
                  console.warn('[sendToModerationGroup] All media methods failed, sending text only');
                }
              }
            } else {
              // Якщо всі зображення не завантажилися, надсилаємо тільки текст
              console.warn('[sendToModerationGroup] No images loaded, sending text only');
            }
            
            // Надсилаємо кнопки окремим повідомленням після успішного надсилання медіа-групи
            // Або якщо медіа не вдалося відправити, надсилаємо текст з кнопками
            const webappUrlForButtons = process.env.WEBAPP_URL || 'http://localhost:3000';
            const adminLink = source === 'marketplace' 
              ? `\n\n🔗 <a href="${webappUrlForButtons}/admin/listings/${listingId}">Переглянути в адмінці</a>`
              : '';
            
            // Якщо медіа не вдалося відправити, надсилаємо текст з описом
            const messageText = !mediaSent
              ? `${truncatedText}\n\n🔔 <b>Оголошення #${listingId}</b>\n\nОберіть дію:${adminLink}`
              : `🔔 <b>Оголошення #${listingId}</b>\n\nОберіть дію:${adminLink}`;
            
            const buttonsResponse = await fetch(
              `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: MODERATION_GROUP_ID,
                  text: messageText,
                  parse_mode: 'HTML',
                  reply_markup: keyboard,
                }),
              }
            );
            
            if (!buttonsResponse.ok) {
              const errorText = await buttonsResponse.text();
              let error;
              try {
                error = JSON.parse(errorText);
              } catch {
                error = { description: errorText };
              }
              console.error('Telegram API error (buttons after media group):', {
                error,
                listingId,
                source,
              });
              // Не повертаємо false, щоб не блокувати процес
            }
            
            // Повертаємо true, навіть якщо медіа не вдалося відправити - текст надіслано
            return true;
          } catch (error) {
            console.error('[sendToModerationGroup] Error with media group:', error);
            // Якщо виникла помилка, надсилаємо тільки текст, щоб не блокувати користувача
            console.warn('[sendToModerationGroup] Sending text only due to media errors');
            
            const webappUrlForButtons = process.env.WEBAPP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            const adminLink = source === 'marketplace' 
              ? `\n\n🔗 <a href="${webappUrlForButtons}/admin/listings/${listingId}">Переглянути в адмінці</a>`
              : '';
            
            const textResponse = await fetch(
              `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: MODERATION_GROUP_ID,
                  text: `${truncatedText}\n\n🔔 <b>Оголошення #${listingId}</b>\n\nОберіть дію:${adminLink}`,
                  parse_mode: 'HTML',
                  reply_markup: keyboard,
                }),
              }
            );
            
            if (!textResponse.ok) {
              const errorText = await textResponse.text();
              console.error('Telegram API error (text only fallback):', {
                error: errorText,
                listingId,
                source,
              });
              // Все одно повертаємо true, щоб не блокувати процес активації
            }
            
            return true;
          }
        } else {
          // Для Telegram file_id - надсилаємо напряму
          const media = images.map((img, i) => ({
            type: 'photo',
            media: img,
            caption: i === 0 ? truncatedText : undefined,
            parse_mode: i === 0 ? 'HTML' : undefined,
          }));

          const mediaResponse = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMediaGroup`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: MODERATION_GROUP_ID,
                media: media,
              }),
            }
          );

          if (!mediaResponse.ok) {
            const errorText = await mediaResponse.text();
            let error;
            try {
              error = JSON.parse(errorText);
            } catch {
              error = { description: errorText };
            }
            console.error('Telegram API error (media group):', {
              error,
              listingId,
              source,
              mediaCount: media.length,
              firstImageUrl: media[0]?.media,
            });
            return false;
          }

          // Надсилаємо кнопки окремим повідомленням
          const webappUrlForButtons = process.env.WEBAPP_URL || 'http://localhost:3000';
          const adminLink = source === 'marketplace' 
            ? `\n\n🔗 <a href="${webappUrlForButtons}/admin/listings/${listingId}">Переглянути в адмінці</a>`
            : '';
          
          const buttonsResponse = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: MODERATION_GROUP_ID,
                text: `🔔 <b>Оголошення #${listingId}</b>\n\nОберіть дію:${adminLink}`,
                parse_mode: 'HTML',
                reply_markup: keyboard,
              }),
            }
          );

          if (!buttonsResponse.ok) {
            const errorText = await buttonsResponse.text();
            let error;
            try {
              error = JSON.parse(errorText);
            } catch {
              error = { description: errorText };
            }
            console.error('Telegram API error (buttons):', {
              error,
              listingId,
              source,
            });
            return false;
          }
        }
      }
    } else {
      // Тільки текст
      const response = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: MODERATION_GROUP_ID,
            text: truncatedText,
            parse_mode: 'HTML',
            reply_markup: keyboard,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        let error;
        try {
          error = JSON.parse(errorText);
        } catch {
          error = { description: errorText };
        }
        console.error('Telegram API error (sendMessage):', {
          error,
          listingId,
          source,
          textLength: truncatedText.length,
        });
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error sending listing to moderation group:', error);
    return false;
  }
}

function formatListingText(
  listing: ListingData,
  source: string,
  listingId: number,
  isEdit?: boolean
): string {
  const sourceEmoji = source === 'marketplace' ? '🌐' : '📱';
  const sourceText = source === 'marketplace' ? 'Маркетплейс' : 'Telegram бот';

  const username = listing.username || '';
  const firstName = listing.firstName || '';
  const lastName = listing.lastName || '';
  const sellerName = `${firstName} ${lastName}`.trim() || username || 'Невідомий';

  const sellerInfo = username
    ? `@${username} (${sellerName})`
    : sellerName;

  const price = listing.price || '0';
  const currency = listing.currency || 'EUR';
  const priceText = `${price} ${currency}`;

  const category = listing.category || 'Не вказано';
  const subcategory = listing.subcategory;
  const categoryText = subcategory ? `${category} / ${subcategory}` : category;

  const location = listing.location || 'Не вказано';
  const createdAt = formatDate(listing.createdAt);

  // Формуємо посилання на адмінку (тільки для маркетплейсу)
  const webappUrl = process.env.WEBAPP_URL || 'http://localhost:3000';
  const adminLink = source === 'marketplace' 
    ? `\n\n🔗 <a href="${webappUrl}/admin/listings/${listingId}">Переглянути в адмінці</a>`
    : '';

  // Додаємо пометку про редагування якщо потрібно
  const editNote = isEdit ? '\n\n⚠️ <b>ОГОЛОШЕННЯ ОНОВЛЕНО</b> - потрібна повторна модерація' : '';

  return `${sourceEmoji} <b>Оголошення на модерацію</b> #${listingId}${editNote}

📌 <b>Назва:</b> ${listing.title || 'Без назви'}

📄 <b>Опис:</b>
${listing.description || 'Без опису'}

💰 <b>Ціна:</b> ${priceText}
📂 <b>Категорія:</b> ${categoryText}
📍 <b>Розташування:</b> ${location}

👤 <b>Продавець:</b> ${sellerInfo}
📅 <b>Створено:</b> ${createdAt}

<i>Джерело: ${sourceText}</i>${adminLink}`;
}

function getImages(images: string | string[]): string[] {
  let imageArray: string[] = [];

  if (typeof images === 'string') {
    try {
      imageArray = JSON.parse(images);
    } catch {
      // Якщо не JSON, спробуємо як один рядок
      if (images.trim()) {
        imageArray = [images];
      } else {
        imageArray = [];
      }
    }
  } else if (Array.isArray(images)) {
    imageArray = images;
  }

  // Фільтруємо порожні значення
  imageArray = imageArray.filter(img => img && typeof img === 'string' && img.trim());

  // Конвертуємо відносні URL в абсолютні для маркетплейсу
  const webappUrl = process.env.WEBAPP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  imageArray = imageArray.map(img => {
    const trimmedImg = img.trim();
    
    // Якщо це вже повний HTTP/HTTPS URL, повертаємо як є
    if (trimmedImg.startsWith('http://') || trimmedImg.startsWith('https://')) {
      return trimmedImg;
    }
    
    // Якщо це file_id (Telegram file_id зазвичай не містить слешів на початку)
    // Але для безпеки перевіряємо чи це не відносний шлях
    if (!trimmedImg.startsWith('/') && !trimmedImg.includes('/') && !trimmedImg.includes('..')) {
      // Може бути file_id, повертаємо як є
      return trimmedImg;
    }
    
    // Відносний шлях - конвертуємо в повний URL через API route
    // Наприклад: /listings/file.webp -> https://tradegrnd.com/api/images/listings/file.webp
    // Або: listings/file.webp -> https://tradegrnd.com/api/images/listings/file.webp
    const pathWithSlash = trimmedImg.startsWith('/') ? trimmedImg : '/' + trimmedImg;
    
    // Завжди використовуємо API route для зображень з listings
    return `${webappUrl}/api/images${pathWithSlash}`;
  });

  // Фільтруємо дублікати та обмежуємо до 10 фото
  const uniqueImages = Array.from(new Set(imageArray));
  return uniqueImages.slice(0, 10);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'Не вказано';

  try {
    const date = new Date(dateStr);
    return date.toLocaleString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Обрізає текст до максимальної довжини, зберігаючи HTML теги
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Простий підхід: обрізаємо текст і додаємо "..."
  // Якщо текст містить HTML, можемо спробувати зберегти теги, але для простоти
  // просто обрізаємо на безпечній позиції
  let truncated = text.substring(0, maxLength - 3);
  
  // Намагаємося обрізати на межі слова, щоб не обрізати HTML тег навпіл
  const lastSpace = truncated.lastIndexOf(' ');
  const lastTag = truncated.lastIndexOf('<');
  const lastCloseTag = truncated.lastIndexOf('>');
  
  // Якщо є незакритий HTML тег, обрізаємо до останнього закритого тегу
  if (lastTag > lastCloseTag && lastTag > 0) {
    truncated = truncated.substring(0, lastTag);
  } else if (lastSpace > maxLength * 0.8) {
    // Якщо останній пробіл досить близько до кінця, обрізаємо там
    truncated = truncated.substring(0, lastSpace);
  }
  
  return truncated + '...';
}
