/**
 * Дублювання оголошення маркетплейсу в Telegram-канали після апруву.
 * Послуги → TRADE_SERVICES_*; нерухомість/робота/подія → TRADE_*.
 */

import { publishListingToChannel } from '@/lib/moderation/publishToChannel';
import {
  channelPublishMode,
  isHamburgLocation,
} from '@/lib/moderation/channelPublishEligibility';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TRADE_SERVICES_HAMBURG =
  process.env.TRADE_SERVICES_CHANNEL_HAMBURG_ID || process.env.TRADE_CHANNEL_ID;
const TRADE_SERVICES_GERMANY =
  process.env.TRADE_SERVICES_CHANNEL_GERMANY_ID ||
  process.env.TRADE_GERMANY_CHANNEL_ID ||
  process.env.TRADE_CHANNEL_ID;

type MarketplaceListingLike = {
  id: number;
  title: string;
  description?: string | null;
  price?: string | number | null;
  currency?: string | null;
  category: string;
  subcategory?: string | null;
  condition?: string | null;
  location?: string | null;
  images?: string | string[] | null;
  isFree?: boolean | number | null;
};

function resolveServicesChannelId(location?: string | null): string | null {
  return isHamburgLocation(location) ? TRADE_SERVICES_HAMBURG || null : TRADE_SERVICES_GERMANY || null;
}

async function publishToServicesChannel(listing: MarketplaceListingLike): Promise<number | null> {
  const channelId = resolveServicesChannelId(listing.location);
  if (!channelId || !BOT_TOKEN) {
    console.warn('[publishMarketplaceToChannels] SERVICES channel or bot token missing');
    return null;
  }

  const botUsername = (
    process.env.NEXT_PUBLIC_BOT_USERNAME ||
    process.env.BOT_USERNAME ||
    'TradeGroundBot'
  ).replace(/^@/, '');
  const listingUrl = `https://t.me/${botUsername}/app?startapp=listing_${listing.id}`;

  const title = listing.title || '';
  const description = (listing.description || '').trim();
  const price = listing.isFree ? 'Free' : `${listing.price ?? ''} ${listing.currency || 'EUR'}`.trim();
  const categoryText = listing.subcategory
    ? `${listing.category} / ${listing.subcategory}`
    : listing.category;
  const location = listing.location || '';

  const caption = `<b>${escapeHtml(title)}</b>

${escapeHtml(description)}

💰 <b>Ціна:</b> ${escapeHtml(price)}
📂 <b>Категорія:</b> ${escapeHtml(categoryText)}
📍 <b>Локація:</b> ${escapeHtml(location)}`;

  const replyMarkup = {
    inline_keyboard: [[{ text: 'Дивитись оголошення', url: listingUrl }]],
  };

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: channelId,
      text: caption.slice(0, 4000),
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error('[publishMarketplaceToChannels] services send failed', response.status, errText);
    return null;
  }
  const data = await response.json();
  return data?.result?.message_id ?? null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function publishMarketplaceListingToChannels(
  listing: MarketplaceListingLike
): Promise<{ mode: string | null; messageId: number | null }> {
  const mode = channelPublishMode(listing.category, listing.subcategory);
  if (!mode) {
    return { mode: null, messageId: null };
  }

  if (mode === 'services') {
    const messageId = await publishToServicesChannel(listing);
    return { mode, messageId };
  }

  const region = isHamburgLocation(listing.location) ? 'hamburg' : 'other_germany';
  const messageId = await publishListingToChannel(listing.id, {
    id: listing.id,
    title: listing.title,
    description: listing.description || '',
    price: listing.price ?? '0',
    currency: listing.currency || 'EUR',
    category: listing.category,
    subcategory: listing.subcategory || undefined,
    condition: listing.condition || undefined,
    location: listing.location || '',
    images: listing.images || [],
    region,
  });
  return { mode, messageId };
}
