/**
 * Один HTTP-запит на профіль з expand=language,stats + дедуплікація паралельних викликів
 * (useUser, LanguageContext тощо).
 */

type BundleResponse = Record<string, unknown>;

const inflight = new Map<string, Promise<{ res: Response; data: BundleResponse }>>();

export async function loadProfileBundle(telegramId: number): Promise<{ res: Response; data: BundleResponse }> {
  const key = String(telegramId);
  let p = inflight.get(key);
  if (!p) {
    p = fetch(`/api/user/profile?telegramId=${key}&expand=language,stats`)
      .then(async (res) => {
        const data = (await res.json()) as BundleResponse;
        return { res, data };
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, p);
  }
  return p;
}
