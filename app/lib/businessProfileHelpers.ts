import { prisma } from '@/lib/prisma';
import { nowSQLite } from '@/utils/dateHelpers';
import { createTransaction } from '@/utils/dbHelpers';
import {
  BUSINESS_PLANS,
  BUSINESS_PLAN_MONTHLY_CREDITS,
  BUSINESS_SUBSCRIPTION_DAYS,
  type BusinessPlanId,
} from '@/lib/businessProfileConstants';
import type { PaymentMethod } from '@/lib/payments/paymentConstants';

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
  listingIds?: number[];
};

export function parseLinkedListingIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((id) => parseInt(String(id), 10)).filter((id) => Number.isFinite(id));
  } catch {
    return [];
  }
}

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
  data: BusinessProfileInput
): Promise<number> {
  const existing = await prisma.businessProfile.findUnique({ where: { userId } });

  const payload = {
    businessName: data.businessName.trim(),
    category: data.category,
    subcategory: data.subcategory || null,
    description: data.description.trim(),
    city: data.city.trim(),
    address: data.address?.trim() || null,
    serviceArea: data.serviceArea,
    serviceRadiusKm: data.serviceRadiusKm ?? null,
    telegram: data.telegram?.trim() || null,
    phone: data.phone?.trim() || null,
    instagram: data.instagram?.trim() || null,
    website: data.website?.trim() || null,
    workingHours: data.workingHours?.trim() || null,
    logo: data.logo ?? existing?.logo ?? null,
    coverImage: data.coverImage ?? existing?.coverImage ?? null,
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

export async function expireDueBusinessSubscriptions(limit = 200): Promise<number> {
  const now = new Date();
  const due = await prisma.businessProfile.findMany({
    where: {
      subscriptionStatus: 'active',
      subscriptionEndsAt: { lt: now },
    },
    take: limit,
    select: { id: true, userId: true },
  });

  for (const profile of due) {
    await deactivateBusinessProfile(profile.userId, profile.id);
  }

  return due.length;
}

export async function expireBusinessProfileIfNeeded(userId: number): Promise<void> {
  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!profile) return;
  if (profile.subscriptionStatus === 'active' && profile.subscriptionEndsAt && profile.subscriptionEndsAt <= new Date()) {
    await deactivateBusinessProfile(userId, profile.id);
  }
}

export async function activateBusinessSubscription(
  userId: number,
  businessProfileId: number,
  plan: BusinessPlanId,
  listingIds: number[] = []
): Promise<void> {
  const profile = await prisma.businessProfile.findUnique({ where: { id: businessProfileId } });
  const storedIds = parseLinkedListingIds(profile?.linkedListingIds);
  const idsToAssign =
    listingIds.length > 0 ? listingIds : storedIds.length > 0 ? storedIds : [];

  const credits = BUSINESS_PLAN_MONTHLY_CREDITS[plan];
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + BUSINESS_SUBSCRIPTION_DAYS);

  await prisma.businessProfile.update({
    where: { id: businessProfileId },
    data: {
      plan,
      subscriptionStatus: 'active',
      subscriptionEndsAt: endsAt,
      isPublished: true,
      linkedListingIds: JSON.stringify(idsToAssign),
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
  if (currentBalance < price) {
    throw new Error('Insufficient balance');
  }

  const newBalance = currentBalance - price;
  const nowStr = nowSQLite();

  await prisma.$executeRawUnsafe(
    `UPDATE User SET balance = ?, updatedAt = ? WHERE id = ?`,
    newBalance,
    nowStr,
    userId
  );

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
  const telegramIdNum = parseInt(telegramId, 10);
  if (Number.isNaN(telegramIdNum)) return null;

  const users = (await prisma.$queryRawUnsafe(
    `SELECT id, username, createdAt FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
    telegramIdNum
  )) as Array<{
    id: number;
    username: string | null;
    createdAt: Date | string;
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

  const listingIds = parseLinkedListingIds(profile.linkedListingIds);
  const activeListingsCount = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) as cnt FROM Listing WHERE userId = ? AND COALESCE(profileType, 'personal') = 'business' AND status = 'active'`,
    user.id
  )) as Array<{ cnt: bigint | number }>;

  return {
    profile,
    user,
    listingIds,
    activeListingsCount: Number(activeListingsCount[0]?.cnt ?? 0),
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

export async function getBusinessSellerSummaryForUser(
  userId: number,
  lang: 'uk' | 'ru' = 'uk'
) {
  await expireBusinessProfileIfNeeded(userId);

  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!profile || !isBusinessProfileActive(profile)) return null;

  const users = (await prisma.$queryRawUnsafe(
    `SELECT CAST(telegramId AS INTEGER) as telegramId, username, createdAt FROM User WHERE id = ?`,
    userId
  )) as Array<{
    telegramId: number;
    username: string | null;
    createdAt: Date | string;
  }>;

  const user = users[0];
  if (!user) return null;

  const activeListingsCount = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) as cnt FROM Listing WHERE userId = ? AND COALESCE(profileType, 'personal') = 'business' AND status = 'active'`,
    userId
  )) as Array<{ cnt: bigint | number }>;

  return {
    businessName: profile.businessName,
    logo: profile.logo,
    category: profile.category,
    city: profile.city,
    activeListingsCount: Number(activeListingsCount[0]?.cnt ?? 0),
    followersCount: profile.followersCount,
    memberSince: formatBusinessMemberSince(user.createdAt, lang),
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
