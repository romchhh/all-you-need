/**
 * Єдина точка узгодження BusinessProfile ↔ Listing.profileType ↔ пошук/вітрина.
 * Усі read/write шляхи мають викликати ensureBusinessProfileConsistency(userId).
 */

import { prisma } from '@/lib/prisma';
import {
  assignListingsToProfile,
  expireBusinessProfileIfNeeded,
  isBusinessProfileActive,
  repairFreeBusinessProfileIfNeeded,
  repairStaleFreeBusinessProfilesForSearch,
  syncBusinessListingProfileTypes,
} from '@/lib/businessProfileHelpers';
import { isBusinessProfilePubliclyVisible } from '@/lib/businessCabinetState';

export type BusinessProfileConsistencyState = {
  profile: Awaited<ReturnType<typeof prisma.businessProfile.findUnique>> | null;
  isActive: boolean;
  isPublic: boolean;
};

export type ListingProfileSyncAction = 'sync_vitrine' | 'demote_all_personal';

/** Чиста логіка — коли тегати оголошення як business. */
export function resolveListingProfileSyncAction(
  isActive: boolean,
  isPublic: boolean
): ListingProfileSyncAction {
  return isActive && isPublic ? 'sync_vitrine' : 'demote_all_personal';
}

/**
 * Виправляє legacy-стан профілю, прострочення PRO, profileType оголошень.
 * Публічний business (пошук + вітрина) = active підписка + isPublished.
 */
export async function ensureBusinessProfileConsistency(
  userId: number
): Promise<BusinessProfileConsistencyState> {
  if (!Number.isFinite(userId) || userId <= 0) {
    return { profile: null, isActive: false, isPublic: false };
  }

  await repairFreeBusinessProfileIfNeeded(userId);
  await expireBusinessProfileIfNeeded(userId);

  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!profile?.businessName?.trim()) {
    return { profile: null, isActive: false, isPublic: false };
  }

  const isActive = isBusinessProfileActive(profile);
  const isPublic = isBusinessProfilePubliclyVisible(profile);
  const action = resolveListingProfileSyncAction(isActive, isPublic);

  try {
    if (action === 'sync_vitrine') {
      await syncBusinessListingProfileTypes(userId);
    } else {
      await assignListingsToProfile(userId, []);
    }
  } catch (err) {
    console.error('[ensureBusinessProfileConsistency] listing sync failed', { userId, err });
  }

  return { profile, isActive, isPublic };
}

/** Перед пошуком бізнесів — batch repair free-профілів з legacy isPublished=false. */
export async function ensureBusinessSearchCatalogFresh(): Promise<void> {
  try {
    await repairStaleFreeBusinessProfilesForSearch();
  } catch (err) {
    console.error('[ensureBusinessSearchCatalogFresh]', err);
  }
}

export async function ensureBusinessProfileConsistencyByTelegramId(
  telegramId: string
): Promise<BusinessProfileConsistencyState & { userId: number | null }> {
  const trimmed = telegramId.trim();
  if (!trimmed) {
    return { profile: null, isActive: false, isPublic: false, userId: null };
  }

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT id FROM User WHERE CAST(telegramId AS TEXT) = ? LIMIT 1`,
    trimmed
  )) as Array<{ id: number | bigint | string }>;

  const rawId = rows[0]?.id;
  const userId =
    typeof rawId === 'bigint'
      ? Number(rawId)
      : typeof rawId === 'number'
        ? rawId
        : typeof rawId === 'string'
          ? Number(rawId.trim())
          : NaN;

  if (!Number.isFinite(userId) || userId <= 0) {
    return { profile: null, isActive: false, isPublic: false, userId: null };
  }

  const state = await ensureBusinessProfileConsistency(userId);
  return { ...state, userId };
}
