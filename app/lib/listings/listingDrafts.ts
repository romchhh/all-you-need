/** Локальні чернетки форми оголошення (IndexedDB), щоб продовжити після закриття. */

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

const DB_NAME = 'ayn-listing-drafts';
const STORE = 'drafts';
const DB_VERSION = 1;
const MAX_DRAFTS = 20;
const MAX_IMAGE_CHARS = 1_800_000;

type StoredDraft = ListingDraft & { ownerKey: string };

function canUseIdb() {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
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
  if (!canUseIdb() || !ownerKey) return [];
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const all = await new Promise<StoredDraft[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as StoredDraft[]) || []);
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    return all
      .filter((row) => row.ownerKey === ownerKey)
      .map(({ ownerKey: _owner, ...draft }) => draft)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    db.close();
  }
}

export async function saveListingDraft(ownerKey: string, draft: ListingDraft): Promise<void> {
  if (!canUseIdb() || !ownerKey) return;
  const record: StoredDraft = {
    ...draft,
    images: trimImages(draft.images),
    ownerKey,
  };
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const existing = (req.result as StoredDraft[]) || [];
        store.put(record);
        const mine = existing
          .filter((row) => row.ownerKey === ownerKey && row.id !== record.id)
          .concat(record)
          .sort((a, b) => b.updatedAt - a.updatedAt);
        for (const extra of mine.slice(MAX_DRAFTS)) store.delete(extra.id);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteListingDraft(ownerKey: string, id: string): Promise<void> {
  if (!canUseIdb() || !ownerKey || !id) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const existing = req.result as StoredDraft | undefined;
        if (existing && existing.ownerKey === ownerKey) store.delete(id);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
