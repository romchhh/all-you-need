/** Локальні чернетки форми оголошення. localStorage — запис синхронний, переживає закриття WebView. */

export type ListingDraftImage = {
  name: string;
  type: string;
  dataUrl: string;
};

export type ListingDraft = {
  id: string;
  updatedAt: number;
  title: string;
  description: string;
  price: string;
  currency: 'UAH' | 'EUR' | 'USD';
  isFree: boolean;
  isNegotiable: boolean;
  category: string;
  subcategory: string;
  location: string;
  condition: string;
  autoRenew: boolean;
  profileType: 'personal' | 'business';
  images: ListingDraftImage[];
};

const STORAGE_PREFIX = 'ayn-listing-drafts:v1:';
const MAX_DRAFTS = 20;
const MAX_IMAGE_CHARS = 400_000;
const memoryDrafts = new Map<string, ListingDraft[]>();

function storageKey(ownerKey: string) {
  return `${STORAGE_PREFIX}${ownerKey}`;
}

function canStore() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function readAll(ownerKey: string): ListingDraft[] {
  if (!ownerKey) return [];
  if (canStore()) {
    try {
      const raw = localStorage.getItem(storageKey(ownerKey));
      if (raw) {
        const parsed = JSON.parse(raw) as ListingDraft[];
        if (Array.isArray(parsed)) {
          const rows = parsed.filter((row) => row && typeof row.id === 'string');
          memoryDrafts.set(ownerKey, rows);
          return rows;
        }
      }
    } catch {
      /* лишаємо пам'ять сесії */
    }
  }
  return memoryDrafts.get(ownerKey) ?? [];
}

function writeAll(ownerKey: string, drafts: ListingDraft[]) {
  memoryDrafts.set(ownerKey, drafts);
  if (!canStore()) return;
  const payload = JSON.stringify(drafts);
  try {
    localStorage.setItem(storageKey(ownerKey), payload);
  } catch {
    const slim = drafts.map((draft) => ({ ...draft, images: [] as ListingDraftImage[] }));
    memoryDrafts.set(ownerKey, slim);
    try {
      localStorage.setItem(storageKey(ownerKey), JSON.stringify(slim));
    } catch {
      /* лишається в пам'яті сесії */
    }
  }
}

export function newListingDraftId() {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listingDraftHasContent(draft: Omit<ListingDraft, 'id' | 'updatedAt'>): boolean {
  return Boolean(
    draft.title.trim() ||
      draft.description.trim() ||
      draft.price.trim() ||
      draft.category.trim() ||
      draft.subcategory.trim() ||
      draft.location.trim() ||
      draft.isFree ||
      draft.isNegotiable ||
      draft.images.length
  );
}

export function dataUrlToFile(dataUrl: string, name: string): File {
  const comma = dataUrl.indexOf(',');
  const meta = comma >= 0 ? dataUrl.slice(0, comma) : '';
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
  const mime = /data:(.*?);/.exec(meta)?.[1] || 'image/jpeg';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name || 'photo.jpg', { type: mime });
}

export function filesFromListingDraft(draft: ListingDraft | null | undefined): {
  previews: string[];
  files: File[];
} {
  if (!draft?.images?.length) return { previews: [], files: [] };
  const previews: string[] = [];
  const files: File[] = [];
  for (const image of draft.images) {
    if (!image?.dataUrl?.startsWith('data:')) continue;
    try {
      files.push(dataUrlToFile(image.dataUrl, image.name || `photo-${files.length + 1}.jpg`));
      previews.push(image.dataUrl);
    } catch {
      /* пропускаємо бите фото */
    }
  }
  return { previews, files };
}

function trimImages(images: ListingDraftImage[]): ListingDraftImage[] {
  const out: ListingDraftImage[] = [];
  for (const image of images) {
    if (!image?.dataUrl?.startsWith('data:')) continue;
    if (image.dataUrl.length > MAX_IMAGE_CHARS) continue;
    out.push({
      name: image.name || `photo-${out.length + 1}.jpg`,
      type: image.type || 'image/jpeg',
      dataUrl: image.dataUrl,
    });
    if (out.length >= 10) break;
  }
  return out;
}

export async function listListingDrafts(ownerKey: string): Promise<ListingDraft[]> {
  return readAll(ownerKey).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveListingDraft(ownerKey: string, draft: ListingDraft): Promise<void> {
  if (!ownerKey) return;
  const record: ListingDraft = {
    ...draft,
    images: trimImages(draft.images),
  };
  const existing = readAll(ownerKey).filter((row) => row.id !== record.id);
  const next = [record, ...existing]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_DRAFTS);
  writeAll(ownerKey, next);
}

export async function deleteListingDraft(ownerKey: string, id: string): Promise<void> {
  if (!ownerKey || !id) return;
  writeAll(
    ownerKey,
    readAll(ownerKey).filter((row) => row.id !== id)
  );
}
