import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findUserByTelegramId, parseTelegramId } from '@/utils/userHelpers';
import { BUSINESS_PLANS, isValidBusinessPlan } from '@/lib/businessProfileConstants';
import type { BusinessPlanId } from '@/lib/businessProfileConstants';
import {
  upsertBusinessProfileDraft,
  activateBusinessSubscription,
  processBusinessSubscriptionFromBalance,
  createBusinessSubscriptionRecord,
  parseLinkedListingIds,
  type BusinessProfileInput,
} from '@/lib/businessProfileHelpers';
import { createMonobankInvoice } from '@/lib/monobank';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      telegramId: telegramIdRaw,
      plan,
      paymentMethod,
      listingIds = [],
      renew = false,
      ...profileData
    } = body;

    if (!telegramIdRaw || !plan || !paymentMethod) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!isValidBusinessPlan(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    if (paymentMethod !== 'balance' && paymentMethod !== 'direct') {
      return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
    }

    const user = await findUserByTelegramId(parseTelegramId(telegramIdRaw));
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const existingProfile = await prisma.businessProfile.findUnique({ where: { userId: user.id } });
    let businessProfileId: number;

    if (renew && !existingProfile) {
      return NextResponse.json({ error: 'Business profile not found for renewal' }, { status: 400 });
    }

    if (renew && existingProfile) {
      businessProfileId = existingProfile.id;
    } else {
      const input: BusinessProfileInput = {
        businessName: String(profileData.businessName || ''),
        category: String(profileData.category || ''),
        subcategory: profileData.subcategory ? String(profileData.subcategory) : null,
        description: String(profileData.description || ''),
        city: String(profileData.city || ''),
        address: profileData.address ? String(profileData.address) : null,
        serviceArea: String(profileData.serviceArea || 'city_only'),
        serviceRadiusKm: profileData.serviceRadiusKm ? Number(profileData.serviceRadiusKm) : null,
        telegram: profileData.telegram ? String(profileData.telegram) : null,
        phone: profileData.phone ? String(profileData.phone) : null,
        instagram: profileData.instagram ? String(profileData.instagram) : null,
        website: profileData.website ? String(profileData.website) : null,
        workingHours: profileData.workingHours ? String(profileData.workingHours) : null,
        logo: profileData.logo ? String(profileData.logo) : null,
        coverImage: profileData.coverImage ? String(profileData.coverImage) : null,
      };

      if (!input.businessName.trim() || !input.category.trim() || !input.description.trim() || !input.city.trim()) {
        return NextResponse.json({ error: 'Required profile fields missing' }, { status: 400 });
      }

      const hasContact = Boolean(
        (input.telegram && input.telegram.trim()) ||
          (input.phone && input.phone.trim()) ||
          (input.instagram && input.instagram.trim()) ||
          (input.website && input.website.trim())
      );
      if (!hasContact) {
        return NextResponse.json({ error: 'At least one contact method required' }, { status: 400 });
      }

      businessProfileId = await upsertBusinessProfileDraft(user.id, input);
    }

    const planId = plan as BusinessPlanId;
    const price = BUSINESS_PLANS[planId].price;
    const storedListingIds = existingProfile ? parseLinkedListingIds(existingProfile.linkedListingIds) : [];
    const normalizedListingIds = Array.isArray(listingIds) && listingIds.length > 0
      ? listingIds.map((id: unknown) => parseInt(String(id), 10)).filter((id: number) => Number.isFinite(id))
      : storedListingIds;
    const subscriptionMetadata = { listingIds: normalizedListingIds, renew: Boolean(renew) };

    if (paymentMethod === 'balance') {
      try {
        const { newBalance } = await processBusinessSubscriptionFromBalance(
          user.id,
          user.balance,
          planId
        );

        await createBusinessSubscriptionRecord(
          user.id,
          businessProfileId,
          planId,
          'balance',
          'active',
          null,
          subscriptionMetadata
        );

        await activateBusinessSubscription(user.id, businessProfileId, planId, normalizedListingIds);

        return NextResponse.json({
          success: true,
          newBalance,
          isActive: true,
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'Insufficient balance') {
          return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
        }
        throw error;
      }
    }

    const subscriptionId = await createBusinessSubscriptionRecord(
      user.id,
      businessProfileId,
      planId,
      'direct',
      'pending',
      null,
      subscriptionMetadata
    );

    const invoiceData = await createMonobankInvoice({
      telegramId: String(telegramIdRaw),
      amount: price,
      type: 'business',
      businessPlan: planId,
      description: `TradeGround Business ${planId === 'business_pro' ? 'PRO' : ''}`,
    });

    await prisma.$executeRawUnsafe(
      `UPDATE BusinessSubscriptionPurchase SET invoiceId = ? WHERE id = ?`,
      invoiceData.invoiceId,
      subscriptionId
    );

    return NextResponse.json({
      success: true,
      pageUrl: invoiceData.pageUrl,
      invoiceId: invoiceData.invoiceId,
      subscriptionId,
    });
  } catch (error) {
    console.error('[Business subscribe]', error);
    return NextResponse.json(
      { error: 'Failed to process business subscription', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
