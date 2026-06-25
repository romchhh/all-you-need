/**
 * Один HTTP-запит на профіль + дедуплікація паралельних викликів (useUser, LanguageContext тощо).
 */

type BundleResponse = Record<string, unknown>;

export type ProfileBundleExpand = 'language' | 'language,stats';

const inflight = new Map<string, Promise<{ res: Response; data: BundleResponse }>>();

export async function loadProfileBundle(
  telegramId: number,
  expand: ProfileBundleExpand = 'language'
): Promise<{ res: Response; data: BundleResponse }> {
  const key = `${telegramId}:${expand}`;
  let p = inflight.get(key);
  if (!p) {
    p = fetch(`/api/user/profile?telegramId=${telegramId}&expand=${expand}`)
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
