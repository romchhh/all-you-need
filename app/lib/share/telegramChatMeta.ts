import { extractPublicTelegramUsername } from '@/lib/share/openShareGroup';

export type TelegramChatMeta = {
  username: string;
  memberCount: number;
  /** Відносний шлях Telegram file API (без токена) або null */
  photoFilePath: string | null;
  fetchedAt: number;
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const metaCache = new Map<string, TelegramChatMeta>();
const inflight = new Map<string, Promise<TelegramChatMeta>>();

function botToken(): string {
  return (process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

async function tgApi<T>(method: string, body: Record<string, unknown>): Promise<T | null> {
  const token = botToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      next: { revalidate: 0 },
    });
    const data = (await res.json()) as { ok?: boolean; result?: T };
    if (!res.ok || !data.ok) return null;
    return data.result ?? null;
  } catch {
    return null;
  }
}

async function fetchMeta(username: string): Promise<TelegramChatMeta> {
  const key = username.toLowerCase();
  const chat = await tgApi<{
    photo?: { small_file_id?: string; big_file_id?: string };
  }>('getChat', { chat_id: `@${key}` });

  let photoFilePath: string | null = null;
  const fileId = chat?.photo?.small_file_id || chat?.photo?.big_file_id;
  if (fileId) {
    const file = await tgApi<{ file_path?: string }>('getFile', { file_id: fileId });
    if (file?.file_path) photoFilePath = file.file_path;
  }

  const count = await tgApi<number>('getChatMemberCount', { chat_id: `@${key}` });

  const meta: TelegramChatMeta = {
    username: key,
    memberCount: typeof count === 'number' && count > 0 ? count : 0,
    photoFilePath,
    fetchedAt: Date.now(),
  };
  metaCache.set(key, meta);
  return meta;
}

export function getCachedTelegramChatMeta(username: string): TelegramChatMeta | null {
  const key = username.toLowerCase();
  const hit = metaCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > CACHE_TTL_MS) {
    metaCache.delete(key);
    return null;
  }
  return hit;
}

export async function resolveTelegramChatMeta(username: string): Promise<TelegramChatMeta> {
  const key = username.toLowerCase().replace(/^@/, '');
  const cached = getCachedTelegramChatMeta(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const job = fetchMeta(key).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, job);
  return job;
}

/** Лише getChatMemberCount (швидше за повний meta) — для списку. */
async function resolveMemberCountOnly(username: string): Promise<number> {
  const key = username.toLowerCase().replace(/^@/, '');
  const cached = getCachedTelegramChatMeta(key);
  if (cached) return cached.memberCount;

  const count = await tgApi<number>('getChatMemberCount', { chat_id: `@${key}` });
  const memberCount = typeof count === 'number' && count > 0 ? count : 0;
  const prev = metaCache.get(key);
  metaCache.set(key, {
    username: key,
    memberCount,
    photoFilePath: prev?.photoFilePath ?? null,
    fetchedAt: Date.now(),
  });
  return memberCount;
}

/** Паралельно з лімітом — для списку груп у distribute (фото lazy через /photo). */
export async function enrichShareChatsWithTelegramMeta<
  T extends { inviteLink: string | null; avatarUrl: string | null; memberCount: number },
>(items: T[], concurrency = 8): Promise<T[]> {
  if (!botToken() || items.length === 0) return items;

  const out = items.map((item) => ({ ...item }));
  let idx = 0;

  async function worker() {
    while (idx < out.length) {
      const i = idx++;
      const item = out[i];
      const username = extractPublicTelegramUsername(item.inviteLink);
      if (!username) continue;

      if (!item.avatarUrl) {
        item.avatarUrl = `/api/share-chats/photo?u=${encodeURIComponent(username)}`;
      }
      if (item.memberCount > 0) continue;

      try {
        const n = await resolveMemberCountOnly(username);
        if (n > 0) item.memberCount = n;
      } catch {
        /* ignore */
      }
    }
  }

  const n = Math.min(concurrency, out.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export function telegramFileUrl(filePath: string): string | null {
  const token = botToken();
  if (!token || !filePath) return null;
  return `https://api.telegram.org/file/bot${token}/${filePath}`;
}

