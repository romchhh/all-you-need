import { NextRequest, NextResponse } from 'next/server';
import { insertAnalyticsEvent } from '@/lib/analytics/analyticsStore';

export const dynamic = 'force-dynamic';

const ALLOWED_LINK_TYPES = new Set([
  'marketplace',
  'bot',
  'channel',
  'business_profile',
  'miniapp',
]);

function resolveBaseUrl(request: NextRequest): string {
  const env =
    process.env.WEBAPP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_WEBAPP_URL ||
    '';
  if (env.trim()) return env.replace(/\/$/, '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  return 'https://tradegrnd.com';
}

function botBaseUrl(): string {
  const botUrl = process.env.NEXT_PUBLIC_BOT_URL;
  const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || process.env.BOT_USERNAME;
  if (botUrl?.trim()) return botUrl.replace(/\/$/, '');
  if (botUsername?.trim()) return `https://t.me/${botUsername.replace(/^@/, '')}`;
  return 'https://t.me/TradeGroundBot';
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const listingIdRaw = searchParams.get('listingId');
  const linkType = (searchParams.get('linkType') || '').trim();
  const lang = searchParams.get('lang') === 'uk' ? 'uk' : 'ru';

  if (!listingIdRaw || !ALLOWED_LINK_TYPES.has(linkType)) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  const listingId = parseInt(listingIdRaw, 10);
  if (Number.isNaN(listingId) || listingId <= 0) {
    return NextResponse.json({ error: 'Invalid listingId' }, { status: 400 });
  }

  const channelUrl = searchParams.get('channelUrl');
  const base = resolveBaseUrl(request);

  try {
    await insertAnalyticsEvent({
      eventName: 'author_notify_click',
      eventGroup: 'engagement',
      entityType: 'listing',
      entityId: String(listingId),
      metadata: {
        linkType,
        lang,
        source: 'author_notify_dm',
      },
    });
  } catch (error) {
    console.error('[analytics/outbound]', error);
  }

  let destination: string;
  switch (linkType) {
    case 'marketplace':
      destination = `${base}/${lang}/listing/${listingId}?ref=author_dm_marketplace`;
      break;
    case 'bot':
      destination = `${botBaseUrl()}?start=listing_${listingId}`;
      break;
    case 'miniapp':
      destination = `${botBaseUrl()}?startapp=listing_${listingId}`;
      break;
    case 'business_profile':
      destination = `${botBaseUrl()}?startapp=business`;
      break;
    case 'channel': {
      const target = (channelUrl || '').trim();
      if (!target.startsWith('http')) {
        return NextResponse.json({ error: 'channelUrl required' }, { status: 400 });
      }
      destination = target;
      break;
    }
    default:
      destination = `${base}/${lang}/listing/${listingId}`;
  }

  return NextResponse.redirect(destination, 302);
}
