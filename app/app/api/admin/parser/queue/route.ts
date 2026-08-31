import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminAuthenticated } from '@/utils/adminAuth';

type QueueTab =
  | 'pending_manual'
  | 'auto_published'
  | 'rejected'
  | 'skipped'
  | 'channel_pending';

const VALID_TABS: QueueTab[] = [
  'pending_manual',
  'auto_published',
  'rejected',
  'skipped',
  'channel_pending',
];

function parseImages(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      return Array.isArray(parsed) ? parsed.map(String) : [t];
    } catch {
      return [t];
    }
  }
  return [];
}

function buildWhere(tab: QueueTab): { sql: string; params: unknown[] } {
  switch (tab) {
    case 'pending_manual':
      return {
        sql: `
          status = 'pending'
          AND marketplace_listing_id IS NULL
          AND IFNULL(auto_approved, 0) = 0
        `,
        params: [],
      };
    case 'auto_published':
      return {
        sql: `
          IFNULL(auto_approved, 0) = 1
          AND marketplace_listing_id IS NOT NULL
        `,
        params: [],
      };
    case 'rejected':
      return {
        sql: `status = 'rejected'`,
        params: [],
      };
    case 'channel_pending':
      return {
        sql: `
          marketplace_listing_id IS NOT NULL
          AND IFNULL(auto_approved, 0) = 1
          AND COALESCE(channel_mod_status, 'pending') = 'pending'
          AND COALESCE(parser_type, 'default') = 'services_channel'
        `,
        params: [],
      };
    default:
      return { sql: '1=1', params: [] };
  }
}

export async function GET(request: NextRequest) {
  try {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const tab = (searchParams.get('tab') || 'pending_manual') as QueueTab;
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);
    const channel = (searchParams.get('channel') || '').trim().toLowerCase();
    const days = Math.max(1, Math.min(30, parseInt(searchParams.get('days') || '7', 10) || 7));

    if (!VALID_TABS.includes(tab)) {
      return NextResponse.json({ error: 'Invalid tab' }, { status: 400 });
    }

    if (tab === 'skipped') {
      let skipSql = `
        SELECT id, source_channel, source_city, message_id, skip_reason,
               title, description, category, raw_text_preview, msg_link,
               parser_type, created_at
        FROM parsed_skips
        WHERE datetime(created_at) >= datetime('now', ?)
      `;
      const skipParams: unknown[] = [`-${days} days`];
      if (channel) {
        skipSql += ` AND LOWER(source_channel) LIKE ?`;
        skipParams.push(`%${channel}%`);
      }
      skipSql += ` ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?`;
      skipParams.push(limit, offset);

      const items = (await prisma.$queryRawUnsafe(skipSql, ...skipParams)) as Record<string, unknown>[];

      let countSql = `
        SELECT COUNT(*) as count FROM parsed_skips
        WHERE datetime(created_at) >= datetime('now', ?)
      `;
      const countParams: unknown[] = [`-${days} days`];
      if (channel) {
        countSql += ` AND LOWER(source_channel) LIKE ?`;
        countParams.push(`%${channel}%`);
      }
      const totalRow = (await prisma.$queryRawUnsafe(countSql, ...countParams)) as Array<{ count: bigint }>;
      const total = Number(totalRow[0]?.count || 0);

      const reasonRows = (await prisma.$queryRawUnsafe(
        `
        SELECT skip_reason, COUNT(*) as count
        FROM parsed_skips
        WHERE datetime(created_at) >= datetime('now', ?)
        GROUP BY skip_reason
        ORDER BY count DESC
        LIMIT 15
        `,
        `-${days} days`
      )) as Array<{ skip_reason: string; count: bigint }>;

      return NextResponse.json({
        tab,
        items,
        total,
        skipReasons: reasonRows.map((r) => ({
          reason: r.skip_reason,
          count: Number(r.count),
        })),
      });
    }

    const { sql: whereSql, params: whereParams } = buildWhere(tab);
    let query = `
      SELECT
        id, source_channel, source_city, message_id, title, description,
        price, currency, is_free, category, subcategory, location,
        images_json, raw_text, status, marketplace_listing_id,
        auto_approved, review_note, parser_type,
        marketplace_mod_status, channel_mod_status,
        msg_link, created_at, moderated_at
      FROM parsed_items
      WHERE ${whereSql}
        AND datetime(created_at) >= datetime('now', ?)
    `;
    const params: unknown[] = [...whereParams, `-${days} days`];
    if (channel) {
      query += ` AND LOWER(source_channel) LIKE ?`;
      params.push(`%${channel}%`);
    }
    query += ` ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = (await prisma.$queryRawUnsafe(query, ...params)) as Record<string, unknown>[];

    let countQuery = `
      SELECT COUNT(*) as count FROM parsed_items
      WHERE ${whereSql}
        AND datetime(created_at) >= datetime('now', ?)
    `;
    const countParams: unknown[] = [...whereParams, `-${days} days`];
    if (channel) {
      countQuery += ` AND LOWER(source_channel) LIKE ?`;
      countParams.push(`%${channel}%`);
    }
    const totalResult = (await prisma.$queryRawUnsafe(countQuery, ...countParams)) as Array<{ count: bigint }>;
    const total = Number(totalResult[0]?.count || 0);

    const items = rows.map((row) => ({
      ...row,
      is_free: Boolean(row.is_free),
      auto_approved: Number(row.auto_approved || 0),
      marketplace_listing_id: row.marketplace_listing_id
        ? Number(row.marketplace_listing_id)
        : null,
      images: parseImages(row.images_json),
    }));

    return NextResponse.json({ tab, items, total, days });
  } catch (error) {
    console.error('[Parser queue API]', error);
    return NextResponse.json({ error: 'Failed to fetch parser queue' }, { status: 500 });
  }
}

/** Зведена статистика для дашборду / sidebar badge */
export async function POST(request: NextRequest) {
  try {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const days = 7;
    const counts = (await prisma.$queryRawUnsafe(
      `
      SELECT
        SUM(CASE WHEN status = 'pending' AND marketplace_listing_id IS NULL
            AND IFNULL(auto_approved, 0) = 0 THEN 1 ELSE 0 END) as pending_manual,
        SUM(CASE WHEN IFNULL(auto_approved, 0) = 1
            AND marketplace_listing_id IS NOT NULL THEN 1 ELSE 0 END) as auto_published,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN marketplace_listing_id IS NOT NULL
            AND IFNULL(auto_approved, 0) = 1
            AND COALESCE(channel_mod_status, 'pending') = 'pending'
            AND COALESCE(parser_type, 'default') = 'services_channel' THEN 1 ELSE 0 END) as channel_pending
      FROM parsed_items
      WHERE datetime(created_at) >= datetime('now', ?)
      `,
      `-${days} days`
    )) as Array<Record<string, bigint>>;

    const skipRow = (await prisma.$queryRawUnsafe(
      `
      SELECT COUNT(*) as count FROM parsed_skips
      WHERE datetime(created_at) >= datetime('now', ?)
      `,
      `-${days} days`
    ).catch(() => [{ count: BigInt(0) }])) as Array<{ count: bigint }>;

    const autoToday = (await prisma.$queryRawUnsafe(
      `
      SELECT COUNT(*) as count FROM parsed_items
      WHERE IFNULL(auto_approved, 0) = 1
        AND marketplace_listing_id IS NOT NULL
        AND datetime(moderated_at) >= datetime('now', 'start of day', 'localtime')
      `
    ).catch(() => [{ count: BigInt(0) }])) as Array<{ count: bigint }>;

    const c = counts[0] || {};
    return NextResponse.json({
      pendingManual: Number(c.pending_manual || 0),
      autoPublished: Number(c.auto_published || 0),
      rejected: Number(c.rejected || 0),
      channelPending: Number(c.channel_pending || 0),
      skipped: Number(skipRow[0]?.count || 0),
      autoPublishedToday: Number(autoToday[0]?.count || 0),
    });
  } catch (error) {
    console.error('[Parser queue stats]', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
