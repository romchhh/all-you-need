import { NextRequest, NextResponse } from 'next/server';
import { LISTING_MEDIA_CACHE_CONTROL } from '@/lib/media/listingMediaConstants';
import { readFileBuffer, statFile } from '@/lib/server/nodeFs';

export async function serveListingMediaFile(
  request: NextRequest,
  fullPath: string,
  etagKey: string,
  contentType: string
): Promise<NextResponse> {
  const fileStat = await statFile(fullPath);
  const etag = `"${etagKey}-${fileStat.mtimeMs.toString(36)}-${fileStat.size.toString(36)}"`;

  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        'Cache-Control': LISTING_MEDIA_CACHE_CONTROL,
        ETag: etag,
      },
    });
  }

  const fileBuffer = await readFileBuffer(fullPath);
  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': LISTING_MEDIA_CACHE_CONTROL,
      ETag: etag,
    },
  });
}
