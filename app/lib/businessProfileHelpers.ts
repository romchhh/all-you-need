import { prisma } from '@/lib/prisma';
import { nowSQLite } from '@/utils/dateHelpers';
import { createTransaction } from '@/utils/dbHelpers';
import {
  BUSINESS_PLANS,
  BUSINESS_PLAN_MONTHLY_CREDITS,
  BUSINESS_SUBSCRIPTION_DAYS,
  type BusinessPlanId,
  type BusinessProfileStatsPayload,
} from '@/lib/businessProfileConstants';
import type { PaymentMethod } from '@/lib/payments/paymentConstants';
import {
  parseLinkedListingIds,
  parseListingDisplayConfig,
  serializeListingDisplayConfig,
  serializePortfolioItems,
  type ListingDisplayMode,
} from '@/lib/businessProfileSettings';
import {
  parseBusinessDirections,
  serializeBusinessDirections,
} from '@/lib/businessSphereConstants';

export { parseLinkedListingIds } from '@/lib/businessProfileSettings';

export type BusinessProfileInput = {
  businessName: string;
  category: string;
  subcategory?: string | null;
  description: string;
  city: string;
  address?: string | null;
  serviceArea: string;
  serviceRadiusKm?: number | null;
  telegram?: string | null;
  phone?: string | null;
  instagram?: string | null;
  website?: string | null;
  workingHours?: string | null;
  logo?: string | null;
  coverImage?: string | null;
  plan?: BusinessPlanId | null;
  listingIds?: number[];
  listingDisplayMode?: ListingDisplayMode;
  portfolioImages?: Array<string | { url: string; description?: string }> | null;
};


export function isBusinessProfileActive(profile: {
  subscriptionStatus: string;
  subscriptionEndsAt: Date | null | undefined;
}): boolean {
  if (profile.subscriptionStatus !== 'active') return false;
  if (!profile.subscriptionEndsAt) return true;
  return profile.subscriptionEndsAt > new Date();
}

export async function upsertBusinessProfileDraft(
  userId: number,
  data: BusinessProfileInput,
  options?: { partial?: boolean }
): Promise<number> {
  const existing = await prisma.businessProfile.findUnique({ where: { userId } });
  const partial = options?.partial ?? false;

  const pickString = (value: string | undefined | null, existingValue: string | null | undefined) => {
    const trimmed = value != null ? String(value).trim() : '';
    if (trimmed) return trimmed;
    if (partial) return existingValue ?? '';
    return trimmed;
  };

  const listingIdsJson = (() => {
    if (data.listingDisplayMode !== undefined) {
      let ids = data.listingIds ?? [];
      if (
        data.listingDisplayMode === 'manual' &&
        ids.length === 0 &&
        existing?.linkedListingIds
      ) {
        const prev = parseListingDisplayConfig(existing.linkedListingIds);
        if (prev.mode === 'manual' && prev.ids.length > 0) {
          ids = prev.ids;
        }
      }
      return serializeListingDisplayConfig(data.listingDisplayMode, ids);
    }
    if (data.listingIds !== undefined) {
      if (data.listingIds.length > 0) {
        return serializeListingDisplayConfig('manual', data.listingIds);
      }
      return existing?.linkedListingIds ?? serializeListingDisplayConfig('all', []);
    }
    return existing?.linkedListingIds ?? null;
  })();

  const payload = {
    businessName: pickString(data.businessName, existing?.businessName),
    category: pickString(data.category, existing?.category),
    subcategory:
      data.subcategory !== undefined
        ? serializeBusinessDirections(parseBusinessDirections(data.subcategory))
        : partial
          ? existing?.subcategory ?? null
          : null,
    description: pickString(data.description, existing?.description),
    city: pickString(data.city, existing?.city),
    address: data.address?.trim() || (partial ? existing?.address ?? null : null),
    serviceArea: data.serviceArea || (partial ? existing?.serviceArea ?? 'city_only' : data.serviceArea),
    serviceRadiusKm: data.serviceRadiusKm ?? (partial ? existing?.serviceRadiusKm ?? null : null),
    telegram: data.telegram?.trim() || (partial ? existing?.telegram ?? null : null),
    phone: data.phone?.trim() || (partial ? existing?.phone ?? null : null),
    instagram: data.instagram?.trim() || (partial ? existing?.instagram ?? null : null),
    website: data.website?.trim() || (partial ? existing?.website ?? null : null),
    workingHours: data.workingHours?.trim() || (partial ? existing?.workingHours ?? null : null),
    logo: data.logo !== undefined ? data.logo : existing?.logo ?? null,
    coverImage: data.coverImage !== undefined ? data.coverImage : existing?.coverImage ?? null,
    plan: data.plan !== undefined ? data.plan : existing?.plan ?? null,
    linkedListingIds: listingIdsJson,
    portfolioImages:
      data.portfolioImages !== undefined
        ? serializePortfolioItems(data.portfolioImages ?? [])
        : partial
          ? existing?.portfolioImages ?? null
          : existing?.portfolioImages ?? null,
    updatedAt: new Date(),
  };

  if (existing) {
    await prisma.businessProfile.update({
      where: { id: existing.id },
      data: payload,
    });
    return existing.id;
  }

  const created = await prisma.businessProfile.create({
    data: {
      userId,
      ...payload,
      subscriptionStatus: 'draft',
      isPublished: false,
    },
  });
  return created.id;
}

/** ID оголошень, які показуються на Business-вітрині (режим «усі» або ручний вибір). */
export async function resolveBusinessListingIds(
  userId: number,
  linkedListingIdsRaw: string | null | undefined
): Promise<number[]> {
  const config = parseListingDisplayConfig(linkedListingIdsRaw);
  if (config.mode === 'manual') {
    return config.ids.filter((id) => Number.isFinite(id));
  }

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT id FROM Listing WHERE userId = ? ORDER BY id DESC`,
    userId
  )) as Array<{ id: number }>;

  return rows.map((row) => row.id).filter((id) => Number.isFinite(id));
}

/** Синхронізує profileType оголошень з вибраними в Business-вітрині. */
export async function syncBusinessListingProfileTypes(userId: number): Promise<void> {
  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!profile || !isBusinessProfileActive(profile)) return;
  const ids = await resolveBusinessListingIds(userId, profile.linkedListingIds);
  await assignListingsToProfile(userId, ids);
}

export async function assignListingsToProfile(
  userId: number,
  businessListingIds: number[]
): Promise<void> {
  const ids = businessListingIds.filter((id) => Number.isFinite(id));
  const nowStr = nowSQLite();

  await prisma.$executeRawUnsafe(
    `UPDATE Listing SET profileType = 'personal', updatedAt = ? WHERE userId = ?`,
    nowStr,
    userId
  );

  if (ids.length === 0) return;

  for (const listingId of ids) {
    await prisma.$executeRawUnsafe(
      `UPDATE Listing SET profileType = 'business', updatedAt = ? WHERE id = ? AND userId = ?`,
      nowStr,
      listingId,
      userId
    );
  }
}

/** Позначає нове оголошення як business і додає його до вітрини, якщо підписка активна. */
export async function linkListingToBusinessIfAllowed(
  userId: number,
  listingId: number
): Promise<boolean> {
  if (!listingId) return false;

  await expireBusinessProfileIfNeeded(userId);
  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!profile || !isBusinessProfileActive(profile)) return false;

  const nowStr = nowSQLite();
  await prisma.$executeRawUnsafe(
    `UPDATE Listing SET profileType = 'business', updatedAt = ? WHERE id = ? AND userId = ?`,
    nowStr,
    listingId,
    userId
  );

  const ids = parseLinkedListingIds(profile.linkedListingIds);
  if (!ids.includes(listingId)) {
    await prisma.businessProfile.update({
      where: { id: profile.id },
      data: {
        linkedListingIds: JSON.stringify([...ids, listingId]),
        updatedAt: new Date(),
      },
    });
  }

  return true;
}

export async function pauseBusinessProfile(userId: number, businessProfileId: number): Promise<void> {
  await prisma.businessProfile.update({
    where: { id: businessProfileId },
    data: {
      isPublished: false,
      updatedAt: new Date(),
    },
  });
}

/** After PRO period ends — keep Business profile on the free tier. */
export async function downgradeProToFreeBusiness(
  userId: number,
  businessProfileId: number
): Promise<void> {
  const now = new Date();
  await prisma.businessProfile.update({
    where: { id: businessProfileId },
    data: {
      plan: 'business',
      subscriptionStatus: 'active',
      subscriptionEndsAt: null,
      subscriptionAutoRenew: true,
      isPublished: true,
      highlightCreditsRemaining: 0,
      topCreditsRemaining: 0,
      updatedAt: now,
    },
  });

  await prisma.businessSubscriptionPurchase.updateMany({
    where: {
      businessProfileId,
      status: 'active',
    },
    data: {
      status: 'expired',
    },
  });

  await syncBusinessListingProfileTypes(userId);
}

export async function deactivateBusinessProfile(
  userId: number,
  businessProfileId: number
): Promise<void> {
  const now = new Date();
  await assignListingsToProfile(userId, []);

  await prisma.businessProfile.update({
    where: { id: businessProfileId },
    data: {
      subscriptionStatus: 'expired',
      isPublished: false,
      highlightCreditsRemaining: 0,
      topCreditsRemaining: 0,
      updatedAt: now,
    },
  });

  await prisma.businessSubscriptionPurchase.updateMany({
    where: {
      businessProfileId,
      status: 'active',
    },
    data: {
      status: 'expired',
    },
  });
}

async function expireEndedProSubscription(
  userId: number,
  profile: { id: number; subscriptionAutoRenew?: boolean }
): Promise<void> {
  const autoRenew = profile.subscriptionAutoRenew ?? true;
  if (!autoRenew) {
    await downgradeProToFreeBusiness(userId, profile.id);
    return;
  }
  // Recurring charge is not wired yet — profile is suspended until manual renewal.
  await deactivateBusinessProfile(userId, profile.id);
}

export async function expireDueBusinessSubscriptions(limit = 200): Promise<number> {
  const now = new Date();
  const due = await prisma.businessProfile.findMany({
    where: {
      subscriptionStatus: 'active',
      plan: 'business_pro',
      subscriptionEndsAt: { lt: now },
    },
    take: limit,
    select: { id: true, userId: true, subscriptionAutoRenew: true },
  });

  for (const profile of due) {
    await expireEndedProSubscription(profile.userId, profile);
  }

  return due.length;
}

export async function expireBusinessProfileIfNeeded(userId: number): Promise<void> {
  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!profile) return;
  if (profile.subscriptionStatus === 'active' && profile.subscriptionEndsAt && profile.subscriptionEndsAt <= new Date()) {
    if (profile.plan === 'business_pro') {
      await expireEndedProSubscription(userId, profile);
    } else {
      await deactivateBusinessProfile(userId, profile.id);
    }
  }
}

export async function activateBusinessSubscription(
  userId: number,
  businessProfileId: number,
  plan: BusinessPlanId,
  listingIds: number[] = []
): Promise<void> {
  const profile = await prisma.businessProfile.findUnique({ where: { id: businessProfileId } });
  const config = parseListingDisplayConfig(profile?.linkedListingIds);
  const explicitIds = listingIds.filter((id) => Number.isFinite(id));
  const idsToAssign =
    explicitIds.length > 0
      ? explicitIds
      : await resolveBusinessListingIds(userId, profile?.linkedListingIds);

  const credits = BUSINESS_PLAN_MONTHLY_CREDITS[plan];
  const now = new Date();
  const isFreePlan = BUSINESS_PLANS[plan].price <= 0;
  const endsAt = new Date(now);
  if (!isFreePlan) {
    endsAt.setDate(endsAt.getDate() + BUSINESS_SUBSCRIPTION_DAYS);
  }

  const linkedListingIds =
    explicitIds.length > 0
      ? serializeListingDisplayConfig('manual', explicitIds)
      : profile?.linkedListingIds && config.mode === 'manual'
        ? profile.linkedListingIds
        : serializeListingDisplayConfig('all', []);

  await prisma.businessProfile.update({
    where: { id: businessProfileId },
    data: {
      plan,
      subscriptionStatus: 'active',
      subscriptionEndsAt: isFreePlan ? null : endsAt,
      ...(isFreePlan ? {} : { subscriptionAutoRenew: true }),
      isPublished: true,
      linkedListingIds,
      highlightCreditsRemaining: credits.highlight,
      topCreditsRemaining: credits.top,
      updatedAt: now,
    },
  });

  await assignListingsToProfile(userId, idsToAssign);
}

export async function processBusinessSubscriptionFromBalance(
  userId: number,
  currentBalance: number,
  plan: BusinessPlanId
): Promise<{ newBalance: number; price: number }> {
  const price = BUSINESS_PLANS[plan].price;
  const balanceBefore = Number(currentBalance);

  if (price <= 0) {
    return { newBalance: balanceBefore, price: 0 };
  }

  if (!Number.isFinite(balanceBefore) || balanceBefore + 0.001 < price) {
    throw new Error('Insufficient balance');
  }

  const nowStr = nowSQLite();

  await prisma.$executeRawUnsafe(
    `UPDATE User SET balance = balance - ?, updatedAt = ? WHERE id = ? AND balance >= ?`,
    price,
    nowStr,
    userId,
    price
  );

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT balance FROM User WHERE id = ?`,
    userId
  )) as Array<{ balance: number | string }>;

  if (rows.length === 0) {
    throw new Error('User not found');
  }

  const newBalance = Number(rows[0].balance);
  if (!Number.isFinite(newBalance) || balanceBefore - newBalance + 0.001 < price) {
    throw new Error('Insufficient balance');
  }

  await createTransaction({
    userId,
    type: 'payment',
    amount: price,
    currency: 'EUR',
    status: 'completed',
    description: `TradeGround Business: ${plan}`,
  });

  return { newBalance, price };
}

export async function createBusinessSubscriptionRecord(
  userId: number,
  businessProfileId: number,
  plan: BusinessPlanId,
  paymentMethod: PaymentMethod,
  status: string,
  invoiceId?: string | null,
  metadata?: Record<string, unknown> | null
): Promise<number> {
  const price = BUSINESS_PLANS[plan].price;
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + BUSINESS_SUBSCRIPTION_DAYS);

  const record = await prisma.businessSubscriptionPurchase.create({
    data: {
      userId,
      businessProfileId,
      plan,
      price,
      paymentMethod,
      status,
      invoiceId: invoiceId || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      startsAt: status === 'active' ? now : null,
      endsAt: status === 'active' ? endsAt : null,
    },
  });

  return record.id;
}

export async function getPublicBusinessProfileByTelegramId(telegramId: string) {
  const trimmed = telegramId.trim();
  if (!trimmed) return null;

  const users = (await prisma.$queryRawUnsafe(
    `SELECT id, username, createdAt, rating, reviewsCount FROM User WHERE CAST(telegramId AS TEXT) = ?`,
    trimmed
  )) as Array<{
    id: number;
    username: string | null;
    createdAt: Date | string;
    rating: number | null;
    reviewsCount: number | null;
  }>;

  const user = users[0];
  if (!user) return null;

  await expireBusinessProfileIfNeeded(user.id);

  const profile = await prisma.businessProfile.findUnique({
    where: { userId: user.id },
  });

  if (!profile || !isBusinessProfileActive(profile) || !profile.isPublished) {
    return null;
  }

  await syncBusinessListingProfileTypes(user.id);

  const vitrineIds = await resolveBusinessListingIds(user.id, profile.linkedListingIds);
  const activeListingsCount =
    vitrineIds.length === 0
      ? 0
      : Number(
          (
            (await prisma.$queryRawUnsafe(
              `SELECT COUNT(*) as cnt FROM Listing WHERE userId = ? AND id IN (${vitrineIds.map(() => '?').join(',')}) AND status = 'active'`,
              user.id,
              ...vitrineIds
            )) as Array<{ cnt: bigint | number }>
          )[0]?.cnt ?? 0
        );

  return {
    profile,
    user,
    listingIds: vitrineIds,
    activeListingsCount,
  };
}

export function formatBusinessMemberSince(dateInput: Date | string, lang: 'uk' | 'ru'): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 30) {
    return lang === 'ru' ? `${Math.max(days, 1)} дн.` : `${Math.max(days, 1)} дн.`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return lang === 'ru' ? `${months} мес.` : `${months} міс.`;
  }
  const years = Math.floor(months / 12);
  return lang === 'ru' ? `${years} г.` : `${years} р.`;
}

export function formatBusinessTelegramSince(dateInput: Date | string): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${m}.${y}`;
}

export async function resolveListingBusinessDisplay(
  userId: number,
  listingId: number,
  lang: 'uk' | 'ru' = 'uk'
): Promise<{
  profileType: 'personal' | 'business';
  businessSeller: Awaited<ReturnType<typeof getBusinessSellerSummaryForUser>>;
}> {
  await syncBusinessListingProfileTypes(userId);
  const row = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { profileType: true },
  });
  const profileType = row?.profileType === 'business' ? 'business' : 'personal';
  const businessSeller =
    profileType === 'business' ? await getBusinessSellerSummaryForUser(userId, lang) : null;
  return { profileType, businessSeller };
}

export async function getBusinessSellerSummaryForUser(
  userId: number,
  lang: 'uk' | 'ru' = 'uk'
) {
  await expireBusinessProfileIfNeeded(userId);

  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!profile || !isBusinessProfileActive(profile)) return null;

  const users = (await prisma.$queryRawUnsafe(
    `SELECT CAST(telegramId AS TEXT) as telegramId, username, createdAt, rating, reviewsCount FROM User WHERE id = ?`,
    userId
  )) as Array<{
    telegramId: string;
    username: string | null;
    createdAt: Date | string;
    rating: number | null;
    reviewsCount: number | null;
  }>;

  const user = users[0];
  if (!user) return null;

  await syncBusinessListingProfileTypes(userId);
  const vitrineIds = await resolveBusinessListingIds(userId, profile.linkedListingIds);
  const activeListingsCount =
    vitrineIds.length === 0
      ? 0
      : Number(
          (
            (await prisma.$queryRawUnsafe(
              `SELECT COUNT(*) as cnt FROM Listing WHERE userId = ? AND id IN (${vitrineIds.map(() => '?').join(',')}) AND status = 'active'`,
              userId,
              ...vitrineIds
            )) as Array<{ cnt: bigint | number }>
          )[0]?.cnt ?? 0
        );

  return {
    businessName: profile.businessName,
    logo: profile.logo,
    category: profile.category,
    city: profile.city,
    activeListingsCount: activeListingsCount,
    followersCount: profile.followersCount,
    memberSince: formatBusinessMemberSince(user.createdAt, lang),
    telegramSince: formatBusinessTelegramSince(user.createdAt),
    rating: Number(user.rating) || 0,
    reviewsCount: Number(user.reviewsCount) || 0,
    plan: profile.plan,
    telegram: profile.telegram,
    phone: profile.phone,
    instagram: profile.instagram,
    website: profile.website,
    sellerTelegramId: String(user.telegramId),
    sellerUsername: user.username,
  };
}

const BUSINESS_EXTRA_PROMOTION_DISCOUNT: Record<BusinessPlanId, number> = {
  business: 0.1,
  business_pro: 0.2,
};

export type BusinessPromotionPricing =
  | { kind: 'credit'; creditType: 'highlight' | 'top'; price: 0 }
  | { kind: 'paid'; price: number; discounted: boolean };

/** Ціна просування з урахуванням Business-кредитів або знижки тарифу. */
export async function resolveBusinessPromotionPricing(
  userId: number,
  promotionType: 'highlighted' | 'top_category' | 'vip'
): Promise<BusinessPromotionPricing | null> {
  const { PROMOTION_PRICES } = await import('@/lib/payments/paymentConstants');
  const basePrice = PROMOTION_PRICES[promotionType]?.price;
  if (basePrice == null) return null;

  await expireBusinessProfileIfNeeded(userId);
  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!profile || !isBusinessProfileActive(profile)) return null;

  if (promotionType === 'highlighted' && profile.highlightCreditsRemaining > 0) {
    return { kind: 'credit', creditType: 'highlight', price: 0 };
  }
  if (promotionType === 'top_category' && profile.topCreditsRemaining > 0) {
    return { kind: 'credit', creditType: 'top', price: 0 };
  }

  const plan = profile.plan;
  if (plan && plan in BUSINESS_EXTRA_PROMOTION_DISCOUNT) {
    const discount = BUSINESS_EXTRA_PROMOTION_DISCOUNT[plan as BusinessPlanId];
    const price = Math.round(basePrice * (1 - discount) * 100) / 100;
    return { kind: 'paid', price, discounted: true };
  }

  return { kind: 'paid', price: basePrice, discounted: false };
}

export async function consumeBusinessPromotionCredit(
  userId: number,
  creditType: 'highlight' | 'top'
): Promise<boolean> {
  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!profile || !isBusinessProfileActive(profile)) return false;

  if (creditType === 'highlight') {
    if (profile.highlightCreditsRemaining <= 0) return false;
    await prisma.businessProfile.update({
      where: { id: profile.id },
      data: {
        highlightCreditsRemaining: { decrement: 1 },
        updatedAt: new Date(),
      },
    });
    return true;
  }

  if (profile.topCreditsRemaining <= 0) return false;
  await prisma.businessProfile.update({
    where: { id: profile.id },
    data: {
      topCreditsRemaining: { decrement: 1 },
      updatedAt: new Date(),
    },
  });
  return true;
}

export type { BusinessProfileStatsPayload };

async function queryBusinessVitrineListingStats(
  userId: number,
  listingIds: number[]
): Promise<{
  totalListings: bigint | number;
  activeListings: bigint | number;
  pendingListings: bigint | number;
  inactiveListings: bigint | number;
  favoritesTotal: bigint | number | null;
}> {
  const empty = {
    totalListings: 0,
    activeListings: 0,
    pendingListings: 0,
    inactiveListings: 0,
    favoritesTotal: 0,
  };
  if (listingIds.length === 0) return empty;

  const { rawQuery } = await import('@/lib/dbSql');
  const placeholders = listingIds.map(() => '?').join(',');

  return (
    (await rawQuery<Array<typeof empty>>(
      prisma,
      `SELECT
          COUNT(*) as totalListings,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeListings,
          SUM(CASE WHEN status = 'pending_moderation' THEN 1 ELSE 0 END) as pendingListings,
          SUM(CASE WHEN status IN ('deactivated', 'hidden', 'expired', 'sold', 'rejected') THEN 1 ELSE 0 END) as inactiveListings,
          COALESCE((
            SELECT COUNT(*)
            FROM Favorite f
            WHERE f.listingId IN (${placeholders})
          ), 0) as favoritesTotal
        FROM Listing
        WHERE userId = ? AND id IN (${placeholders})`,
      [...listingIds, userId, ...listingIds]
    ))[0] ?? empty
  );
}

export async function getBusinessProfileStatsForUserId(
  userId: number
): Promise<BusinessProfileStatsPayload | null> {
  const { rawQuery } = await import('@/lib/dbSql');
  const { isPostgres, sqlNowMinusDays } = await import('@/lib/dbSql');

  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!profile) return null;

  await syncBusinessListingProfileTypes(userId);

  const sinceExpr = sqlNowMinusDays(30);
  const analyticsSinceFilter = isPostgres()
    ? `createdAt >= ${sinceExpr}`
    : `datetime(createdAt) >= ${sinceExpr}`;
  const analyticsAeSinceFilter = isPostgres()
    ? `ae.createdAt >= ${sinceExpr}`
    : `datetime(ae.createdAt) >= ${sinceExpr}`;

  let listingStats: {
    totalListings: bigint | number;
    activeListings: bigint | number;
    pendingListings: bigint | number;
    inactiveListings: bigint | number;
    favoritesTotal: bigint | number | null;
  } | undefined;

  const vitrineIds = await resolveBusinessListingIds(userId, profile.linkedListingIds);

  try {
    listingStats = await queryBusinessVitrineListingStats(userId, vitrineIds);
  } catch (error) {
    console.error('[BusinessProfile stats] listing query failed', error);
  }

  const profileEntityId = String(profile.id);

  let profileViews = 0;
  let profileContacts = 0;
  let listingContacts = 0;
  let listingViews30d = 0;

  try {
    const { ensureAnalyticsEventTable } = await import('@/lib/analytics/analyticsStore');
    await ensureAnalyticsEventTable();

    profileViews = Number(
      (
        await rawQuery<Array<{ cnt: bigint | number }>>(
          prisma,
          `SELECT COUNT(*) as cnt
            FROM AnalyticsEvent
            WHERE eventName = 'profile_view'
              AND entityType = 'business_profile'
              AND entityId = ?
              AND ${analyticsSinceFilter}`,
          [profileEntityId]
        )
      )[0]?.cnt ?? 0
    );

    profileContacts = Number(
      (
        await rawQuery<Array<{ cnt: bigint | number }>>(
          prisma,
          `SELECT COUNT(*) as cnt
            FROM AnalyticsEvent
            WHERE eventName = 'contact_seller'
              AND entityType = 'business_profile'
              AND entityId = ?
              AND ${analyticsSinceFilter}`,
          [profileEntityId]
        )
      )[0]?.cnt ?? 0
    );

    listingContacts = Number(
      (
        await rawQuery<Array<{ cnt: bigint | number }>>(
          prisma,
          `SELECT COUNT(*) as cnt
            FROM AnalyticsEvent ae
            INNER JOIN Listing l ON CAST(ae.entityId AS INTEGER) = l.id
            WHERE ae.eventName = 'contact_seller'
              AND ae.entityType = 'listing'
              AND l.userId = ?
              AND COALESCE(l.profileType, 'personal') = 'business'
              AND ${analyticsAeSinceFilter}`,
          [userId]
        )
      )[0]?.cnt ?? 0
    );

    listingViews30d = Number(
      (
        await rawQuery<Array<{ cnt: bigint | number }>>(
          prisma,
          `SELECT COUNT(*) as cnt
            FROM AnalyticsEvent ae
            INNER JOIN Listing l ON CAST(ae.entityId AS INTEGER) = l.id
            WHERE ae.eventName = 'listing_view'
              AND ae.entityType = 'listing'
              AND l.userId = ?
              AND COALESCE(l.profileType, 'personal') = 'business'
              AND ${analyticsAeSinceFilter}`,
          [userId]
        )
      )[0]?.cnt ?? 0
    );
  } catch {
    // analytics table may be unavailable
  }

  const toNum = (v: bigint | number | null | undefined) => Number(v ?? 0);

  return {
    followersCount: profile.followersCount,
    profileViews,
    listingViews: listingViews30d,
    contactClicks: profileContacts + listingContacts,
    activeListings: toNum(listingStats?.activeListings),
    totalListings: toNum(listingStats?.totalListings),
    pendingListings: toNum(listingStats?.pendingListings),
    inactiveListings: toNum(listingStats?.inactiveListings),
    favoritesTotal: toNum(listingStats?.favoritesTotal),
  };
}

export type BusinessContactChannel = 'telegram' | 'phone' | 'instagram' | 'website';

const BUSINESS_CONTACT_CHANNELS: BusinessContactChannel[] = [
  'telegram',
  'phone',
  'instagram',
  'website',
];

function emptyContactChannelCounts(): Record<BusinessContactChannel, number> {
  return { telegram: 0, phone: 0, instagram: 0, website: 0 };
}

function parseBusinessContactChannel(metadata: string | null): BusinessContactChannel | null {
  if (!metadata) return null;
  try {
    const meta = JSON.parse(metadata) as { channel?: string };
    const ch = meta.channel;
    if (ch && (BUSINESS_CONTACT_CHANNELS as string[]).includes(ch)) {
      return ch as BusinessContactChannel;
    }
  } catch {
    // ignore invalid json
  }
  return null;
}

/** Кліки по контактах на публічному Business-профілі (contact_seller + metadata.channel). */
export async function getBusinessProfileContactChannelStats(
  profileEntityId: string,
  periodDays: number
): Promise<{
  current: Record<BusinessContactChannel, number>;
  previous: Record<BusinessContactChannel, number>;
}> {
  const result = {
    current: emptyContactChannelCounts(),
    previous: emptyContactChannelCounts(),
  };
  const { rawQuery, isPostgres } = await import('@/lib/dbSql');
  const sinceCurrent = isPostgres()
    ? `createdAt >= NOW() - INTERVAL '${periodDays} days'`
    : `datetime(createdAt) >= datetime('now', '-${periodDays} days')`;
  const sincePrevious = isPostgres()
    ? `createdAt >= NOW() - INTERVAL '${periodDays * 2} days' AND createdAt < NOW() - INTERVAL '${periodDays} days'`
    : `datetime(createdAt) >= datetime('now', '-${periodDays * 2} days') AND datetime(createdAt) < datetime('now', '-${periodDays} days')`;

  try {
    const { ensureAnalyticsEventTable } = await import('@/lib/analytics/analyticsStore');
    await ensureAnalyticsEventTable();

    for (const bucket of ['current', 'previous'] as const) {
      const timeFilter = bucket === 'current' ? sinceCurrent : sincePrevious;
      const rows = await rawQuery<Array<{ metadata: string | null }>>(
        prisma,
        `SELECT metadata FROM AnalyticsEvent
          WHERE eventName = 'contact_seller'
            AND entityType = 'business_profile'
            AND entityId = ?
            AND ${timeFilter}`,
        [profileEntityId]
      );
      for (const row of rows) {
        const channel = parseBusinessContactChannel(row.metadata);
        if (channel) result[bucket][channel] += 1;
      }
    }
  } catch {
    // analytics table may be unavailable
  }

  return result;
}

export function businessMetricPctChange(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}
