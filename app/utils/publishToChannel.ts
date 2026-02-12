/**
 * Утиліта для публікації оголошень в Telegram канал
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const TRADE_CHANNEL_ID = process.env.TRADE_CHANNEL_ID;
const TRADE_GERMANY_CHANNEL_ID = process.env.TRADE_GERMANY_CHANNEL_ID;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface ListingData {
  id: number;
  title: string;
  description: string;
  price: string | number;
  currency?: string;
  category: string;
  subcategory?: string;
  condition?: string;
  location: string;
  images: string | string[];
  publicationTariff?: string; // 'standard', 'highlighted', 'pinned', 'story'
  region?: string; // 'hamburg' or 'other_germany'
}

/**
 * Публікує оголошення в Telegram канал
 */
export async function publishListingToChannel(
  listingId: number,
  listingData: ListingData
): Promise<number | null> {
  // Визначаємо канал на основі регіону
  const region = listingData.region || 'hamburg'; // За замовчуванням Гамбург
  const channelId = region === 'other_germany' 
    ? TRADE_GERMANY_CHANNEL_ID 
    : TRADE_CHANNEL_ID;
  
  if (!channelId || !BOT_TOKEN) {
    console.warn(`${region === 'other_germany' ? 'TRADE_GERMANY_CHANNEL_ID' : 'TRADE_CHANNEL_ID'} or TELEGRAM_BOT_TOKEN not set`);
    return null;
  }

  try {
    // Формуємо текст оголошення
    const title = listingData.title || '';
    const description = listingData.description || '';
    const price = listingData.price || '0';
    const currency = listingData.currency || 'EUR';
    const category = listingData.category || '';
    const subcategory = listingData.subcategory;
    const condition = listingData.condition || '';
    const location = listingData.location || '';

    const categoryText = subcategory ? `${category} / ${subcategory}` : category;
    
    const conditionMap: Record<string, string> = {
      new: '🆕 Новий',
      used: '🔧 Б/у',
    };
    const conditionText = conditionMap[condition] || condition;

    // Застосовуємо тариф публікації
    const tariff = listingData.publicationTariff || 'standard';
    let titlePrefix = '';
    let titleStyle = title;
    
    if (tariff === 'highlighted') {
      titlePrefix = '⭐ ';
      titleStyle = `<b>${title}</b>`;
    } else if (tariff === 'pinned') {
      titlePrefix = '📌 ';
      titleStyle = `<b>${title}</b>`;
    } else if (tariff === 'story') {
      titlePrefix = '📸 ';
      titleStyle = `<b>${title}</b>`;
    } else {
      titlePrefix = '📌 ';
      titleStyle = title;
    }

    // Формуємо хештег міста (видаляємо пробіли та спецсимволи)
    const cityHashtag = location
      .replace(/\s+/g, '')
      .replace(/ü/g, 'u')
      .replace(/ö/g, 'o')
      .replace(/ä/g, 'a')
      .replace(/ß/g, 'ss')
      .replace(/[^a-zA-Z0-9_-]/g, '');
    const cityHashtagText = cityHashtag ? `#${cityHashtag}` : '';

    // Формуємо хештеги: категорія + місто
    const categoryHashtag = `#${category.replace(/\s+/g, '')}`;
    const hashtags = cityHashtagText 
      ? `${categoryHashtag} ${cityHashtagText}` 
      : categoryHashtag;

    const text = `${titlePrefix}${titleStyle}

📄 ${description}

💰 <b>Ціна:</b> ${price} ${currency}
📂 <b>Категорія:</b> ${categoryText}
📍 <b>Розташування:</b> ${location}

#Оголошення ${hashtags}`;

    // Отримуємо зображення
    let images: string[] = [];
    if (typeof listingData.images === 'string') {
      const trimmed = listingData.images.trim();
      if (trimmed) {
        const looksLikeJson = trimmed.startsWith('[') || trimmed.startsWith('{');
        if (looksLikeJson) {
          try {
            const parsed = JSON.parse(trimmed);
            images = Array.isArray(parsed) ? parsed : (typeof parsed === 'string' ? [parsed] : []);
          } catch (e) {
            console.error('[publishToChannel] Failed to parse images JSON:', e);
            images = [trimmed];
          }
        } else {
          images = [trimmed];
        }
      }
    } else if (Array.isArray(listingData.images)) {
      images = listingData.images;
    }

    images = images.filter(img => img && typeof img === 'string' && img.trim()).slice(0, 10);

    // Публікуємо в канал
    if (images.length > 0) {
      if (images.length === 1) {
        // Одне фото
        const imageUrl = images[0];
        let buffer: Buffer | null = null;
        let isFileId = false;

        // Перевіряємо чи це file_id (Telegram file_id)
        if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
          isFileId = true;
        }

        if (!isFileId) {
          // Завантажуємо зображення
          try {
            if (imageUrl.startsWith('http')) {
              const response = await fetch(imageUrl);
              if (response.ok) {
                buffer = Buffer.from(await response.arrayBuffer());
              }
            } else if (imageUrl.startsWith('/')) {
              const publicPath = join(process.cwd(), 'public', imageUrl);
              if (existsSync(publicPath)) {
                buffer = await readFile(publicPath);
              }
            }
          } catch (error) {
            console.error('[publishToChannel] Error loading image:', error);
          }
        }

        if (isFileId || buffer) {
          // Надсилаємо фото
          if (isFileId) {
            // Використовуємо file_id
            const response = await fetch(
              `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: channelId,
                  photo: imageUrl,
                  caption: text,
                  parse_mode: 'HTML',
                }),
              }
            );

            if (response.ok) {
              const result = await response.json();
              return result.result?.message_id || null;
            }
          } else if (buffer) {
            // Використовуємо multipart/form-data
            const boundary = `----WebKitFormBoundary${Date.now()}`;
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
            appendField('chat_id', channelId!);
            appendField('caption', text);
            appendField('parse_mode', 'HTML');
            formDataParts.push(Buffer.from(`--${boundary}--\r\n`));

            const formDataBuffer = Buffer.concat(formDataParts);

            const response = await fetch(
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

            if (response.ok) {
              const result = await response.json();
              const messageId = result.result?.message_id || null;
              
              // Закріплюємо повідомлення якщо тариф 'pinned'
              if (messageId && tariff === 'pinned') {
                try {
                  await fetch(
                    `https://api.telegram.org/bot${BOT_TOKEN}/pinChatMessage`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        chat_id: channelId,
                        message_id: messageId,
                      }),
                    }
                  );
                } catch (error) {
                  console.error('[publishToChannel] Error pinning message:', error);
                }
              }
              
              return messageId;
            }
          }
        }
      } else {
        // Кілька фото - медіа група
        // Для спрощення надсилаємо тільки перше фото з caption
        const imageUrl = images[0];
        let buffer: Buffer | null = null;
        let isFileId = false;

        if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
          isFileId = true;
        }

        if (!isFileId) {
          try {
            if (imageUrl.startsWith('http')) {
              const response = await fetch(imageUrl);
              if (response.ok) {
                buffer = Buffer.from(await response.arrayBuffer());
              }
            } else if (imageUrl.startsWith('/')) {
              const publicPath = join(process.cwd(), 'public', imageUrl);
              if (existsSync(publicPath)) {
                buffer = await readFile(publicPath);
              }
            }
          } catch (error) {
            console.error('[publishToChannel] Error loading image:', error);
          }
        }

        if (isFileId || buffer) {
          if (isFileId) {
            const response = await fetch(
              `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: channelId,
                  photo: imageUrl,
                  caption: text,
                  parse_mode: 'HTML',
                }),
              }
            );

            if (response.ok) {
              const result = await response.json();
              return result.result?.message_id || null;
            }
          } else if (buffer) {
            const boundary = `----WebKitFormBoundary${Date.now()}`;
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
            appendField('chat_id', channelId!);
            appendField('caption', text);
            appendField('parse_mode', 'HTML');
            formDataParts.push(Buffer.from(`--${boundary}--\r\n`));

            const formDataBuffer = Buffer.concat(formDataParts);

            const response = await fetch(
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

            if (response.ok) {
              const result = await response.json();
              return result.result?.message_id || null;
            }
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
            chat_id: TRADE_CHANNEL_ID,
            text: text,
            parse_mode: 'HTML',
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        const messageId = result.result?.message_id || null;
        
        // Закріплюємо повідомлення якщо тариф 'pinned'
        if (messageId && tariff === 'pinned') {
          try {
            await fetch(
              `https://api.telegram.org/bot${BOT_TOKEN}/pinChatMessage`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: channelId,
                  message_id: messageId,
                }),
              }
            );
          } catch (error) {
            console.error('[publishToChannel] Error pinning message:', error);
          }
        }
        
        return messageId;
      }
    }

    return null;
  } catch (error) {
    console.error('[publishToChannel] Error publishing listing to channel:', error);
    return null;
  }
}
