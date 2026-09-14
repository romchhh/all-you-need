import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { prisma } from '@/lib/prisma';
import { findUserByTelegramId, parseTelegramId } from '@/utils/userHelpers';
import { isValidServiceArea } from '@/lib/businessProfileConstants';
import { upsertBusinessProfileDraft, expireBusinessProfileIfNeeded, isBusinessProfileActive } from '@/lib/businessProfileHelpers';

async function saveUploadedFile(file: File, prefix: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}.${safeExt}`;
  const uploadsDir = join(process.cwd(), 'public', 'business');
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }
  const bytes = await file.arrayBuffer();
  writeFileSync(join(uploadsDir, filename), Buffer.from(bytes));
  return `/business/${filename}`;
}

export async function GET(request: NextRequest) {
  try {
    const telegramId = request.nextUrl.searchParams.get('telegramId');
    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId is required' }, { status: 400 });
    }

    const user = await findUserByTelegramId(parseTelegramId(telegramId));
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await expireBusinessProfileIfNeeded(user.id);

    const profile = await prisma.businessProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      return NextResponse.json({ profile: null, isActive: false, isSuspended: false, hasProfile: false });
    }

    const isActive = isBusinessProfileActive(profile);
    const isSuspended = !isActive && profile.subscriptionStatus === 'expired';

    return NextResponse.json({
      hasProfile: true,
      isActive,
      isSuspended,
      profile: {
        ...profile,
        subscriptionEndsAt: profile.subscriptionEndsAt?.toISOString() ?? null,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[BusinessProfile GET]', error);
    return NextResponse.json({ error: 'Failed to fetch business profile' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let telegramIdRaw: string | null = null;
    let body: Record<string, unknown> = {};
    let logoPath: string | null | undefined;
    let coverPath: string | null | undefined;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      telegramIdRaw = String(form.get('telegramId') || '');
      body = {
        partial: form.get('partial'),
        businessName: form.get('businessName'),
        category: form.get('category'),
        subcategory: form.get('subcategory'),
        description: form.get('description'),
        city: form.get('city'),
        address: form.get('address'),
        serviceArea: form.get('serviceArea'),
        serviceRadiusKm: form.get('serviceRadiusKm'),
        telegram: form.get('telegram'),
        phone: form.get('phone'),
        instagram: form.get('instagram'),
        website: form.get('website'),
        workingHours: form.get('workingHours'),
        plan: form.get('plan'),
        listingIds: form.get('listingIds'),
      };
      const logoFile = form.get('logo');
      const coverFile = form.get('coverImage');
      if (logoFile instanceof File && logoFile.size > 0) {
        logoPath = await saveUploadedFile(logoFile, 'logo');
      }
      if (coverFile instanceof File && coverFile.size > 0) {
        coverPath = await saveUploadedFile(coverFile, 'cover');
      }
    } else {
      const json = await request.json();
      telegramIdRaw = String(json.telegramId || '');
      body = json;
      logoPath = json.logo ?? undefined;
      coverPath = json.coverImage ?? undefined;
    }

    if (!telegramIdRaw) {
      return NextResponse.json({ error: 'telegramId is required' }, { status: 400 });
    }

    const user = await findUserByTelegramId(parseTelegramId(telegramIdRaw));
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const businessName = String(body.businessName || '').trim();
    const category = String(body.category || '').trim();
    const description = String(body.description || '').trim();
    const city = String(body.city || '').trim();
    const serviceArea = String(body.serviceArea || 'city_only');
    const isPartial = body.partial === true || body.partial === 'true' || body.partial === 1 || body.partial === '1';

    if (!isPartial && (!businessName || !category || !description || !city)) {
      return NextResponse.json({ error: 'Required fields missing' }, { status: 400 });
    }

    if (serviceArea && !isValidServiceArea(serviceArea)) {
      return NextResponse.json({ error: 'Invalid service area' }, { status: 400 });
    }

    const radiusRaw = body.serviceRadiusKm;
    const serviceRadiusKm =
      radiusRaw != null && String(radiusRaw).trim() !== ''
        ? parseInt(String(radiusRaw), 10)
        : null;

    const listingIdsRaw = body.listingIds;
    let listingIds: number[] | undefined;
    if (listingIdsRaw != null && String(listingIdsRaw).trim() !== '') {
      try {
        const parsed = JSON.parse(String(listingIdsRaw)) as unknown;
        if (Array.isArray(parsed)) {
          listingIds = parsed.map((id) => parseInt(String(id), 10)).filter((id) => Number.isFinite(id));
        }
      } catch {
        listingIds = String(listingIdsRaw)
          .split(',')
          .map((id) => parseInt(id.trim(), 10))
          .filter((id) => Number.isFinite(id));
      }
    }

    const planRaw = body.plan;
    const plan =
      planRaw != null && String(planRaw).trim() !== '' ? String(planRaw).trim() : undefined;

    const profileId = await upsertBusinessProfileDraft(
      user.id,
      {
        businessName,
        category,
        subcategory: body.subcategory ? String(body.subcategory) : null,
        description,
        city,
        address: body.address ? String(body.address) : null,
        serviceArea: serviceArea || 'city_only',
        serviceRadiusKm: Number.isFinite(serviceRadiusKm as number) ? serviceRadiusKm : null,
        telegram: body.telegram ? String(body.telegram) : null,
        phone: body.phone ? String(body.phone) : null,
        instagram: body.instagram ? String(body.instagram) : null,
        website: body.website ? String(body.website) : null,
        workingHours: body.workingHours ? String(body.workingHours) : null,
        logo: logoPath ?? null,
        coverImage: coverPath ?? null,
        plan: plan as 'business' | 'business_pro' | null | undefined,
        listingIds,
      },
      { partial: isPartial }
    );

    const profile = await prisma.businessProfile.findUnique({ where: { id: profileId } });

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error('[BusinessProfile PUT]', error);
    return NextResponse.json({ error: 'Failed to save business profile' }, { status: 500 });
  }
}
