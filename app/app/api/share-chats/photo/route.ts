import { NextRequest, NextResponse } from 'next/server';
import {
  resolveTelegramChatMeta,
  telegramFileUrl,
} from '@/lib/share/telegramChatMeta';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const username = (request.nextUrl.searchParams.get('u') || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();

  if (!/^[a-z][\w\d_]{3,31}$/i.test(username)) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const meta = await resolveTelegramChatMeta(username);
    const fileUrl = meta.photoFilePath ? telegramFileUrl(meta.photoFilePath) : null;
    if (!fileUrl) {
      return new NextResponse(null, { status: 404 });
    }

    const upstream = await fetch(fileUrl);
    if (!upstream.ok || !upstream.body) {
      return new NextResponse(null, { status: 404 });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=21600, stale-while-revalidate=86400',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
