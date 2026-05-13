import { useState, useEffect, useCallback } from 'react';

export type UseListingAutoRenewArgs = {
  listingId: number;
  /** Значення з батька / API; при зміні лише `listingId` підтягується знову. */
  serverAutoRenew: boolean | undefined;
  /** Після успішного POST (оновити `selectedListing` у батька). */
  onPersistSuccess?: (next: boolean) => void;
};

/**
 * Локальний стан автопродовження без «зліту» після збереження:
 * не синхронізуємо з пропом при зміні `saving` — лише при зміні `listingId`.
 */
export function useListingAutoRenew({ listingId, serverAutoRenew, onPersistSuccess }: UseListingAutoRenewArgs) {
  const [local, setLocal] = useState(() => !!serverAutoRenew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocal(!!serverAutoRenew);
  }, [listingId, serverAutoRenew]);

  const persist = useCallback(
    async (telegramId: string, next: boolean): Promise<boolean> => {
      if (!telegramId) return false;
      setSaving(true);
      setLocal(next);
      try {
        const res = await fetch(`/api/listings/${listingId}/auto-renew`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegramId, autoRenew: next }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || 'Request failed');
        }
        onPersistSuccess?.(next);
        return true;
      } catch {
        setLocal(!next);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [listingId, onPersistSuccess]
  );

  return { autoRenewLocal: local, autoRenewSaving: saving, persistAutoRenew: persist };
}
