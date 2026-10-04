import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { prisma } from '@/lib/prisma';
import { findUserByTelegramId, parseTelegramId } from '@/utils/userHelpers';
import { isValidServiceArea } from '@/lib/businessProfileConstants';
import { parsePortfolioImages, serializePortfolioImages } from '@/lib/businessProfileSettings';
import { upsertBusinessProfileDraft, expireBusinessProfileIfNeeded, isBusinessProfileActive, assignListingsToProfile, resolveBusinessListingIds, syncBusinessListingProfileTypes } from '@/lib/businessProfileHelpers';
import type { ListingDisplayMode } from '@/lib/businessProfileSettings';
import { normalizeInstagramForStorage, normalizeWebsiteForStorage } from '@/utils/socialLinks';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

function isUploadFile(value: FormDataEntryValue | null): value is File {
  if (value == null || typeof value === 'string') return false;
  return value.size > 0;
}

async function saveUploadedFile(file: File, prefix: string): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('FILE_TOO_LARGE');
  }

  const name = file.name || '';
  const type = file.type || '';
  let ext = name.split('.').pop()?.toLowerCase() || '';
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    if (type.includes('png')) ext = 'png';
    else if (type.includes('webp')) ext = 'webp';
    else ext = 'jpg';
  }
  const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
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
    const isSuspended =
      !isActive &&
      profile.subscriptionStatus === 'expired' &&
      profile.plan === 'business_pro';

    if (isActive) {
      await syncBusinessListingProfileTypes(user.id);
    }

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
    let portfolioImagesParsed: string[] | undefined;
    const portfolioPathsFromUpload: string[] = [];

    if (contentType.includes('multipart/form-data')) {
      let form: FormData;
      try {
        form = await request.formData();
      } catch (parseError) {
        console.error('[BusinessProfile PUT] formData parse failed', parseError);
        return NextResponse.json(
          { error: 'FILE_TOO_LARGE', details: 'Request body is too large' },
          { status: 413 }
        );
      }
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
        listingDisplayMode: form.get('listingDisplayMode'),
      };
      const logoFile = form.get('logo');
      const coverFile = form.get('coverImage');
      const portfolioNew = form.getAll('portfolioNew').filter(isUploadFile);
      const portfolioKeepRaw = form.get('portfolioImages');
      if (portfolioKeepRaw != null && String(portfolioKeepRaw).trim() !== '') {
        try {
          const parsed = JSON.parse(String(portfolioKeepRaw)) as unknown;
          if (Array.isArray(parsed)) {
            portfolioImagesParsed = parsePortfolioImages(JSON.stringify(parsed));
          }
        } catch {
          /* keep undefined */
        }
      }
      try {
        if (isUploadFile(logoFile)) {
          logoPath = await saveUploadedFile(logoFile, 'logo');
        }
        if (isUploadFile(coverFile)) {
          coverPath = await saveUploadedFile(coverFile, 'cover');
        }
      } catch (uploadError) {
        const code = uploadError instanceof Error ? uploadError.message : '';
        if (code === 'FILE_TOO_LARGE') {
          return NextResponse.json(
            { error: 'FILE_TOO_LARGE', details: 'Image exceeds 12MB' },
            { status: 413 }
          );
        }
        console.error('[BusinessProfile PUT] image save failed', uploadError);
        return NextResponse.json(
          {
            error: 'Failed to save image',
            details: uploadError instanceof Error ? uploadError.message : String(uploadError),
          },
          { status: 500 }
        );
      }
      try {
        for (const file of portfolioNew) {
          if (!isUploadFile(file)) continue;
          const path = await saveUploadedFile(file, 'portfolio');
          portfolioPathsFromUpload.push(path);
        }
      } catch (uploadError) {
        console.error('[BusinessProfile PUT] portfolio save failed', uploadError);
        return NextResponse.json({ error: 'Failed to save portfolio image' }, { status: 500 });
      }
    } else {
      const json = await request.json();
      telegramIdRaw = String(json.telegramId || '');
      body = json;
      logoPath =
        typeof json.logo === 'string' && json.logo.trim() ? json.logo.trim() : undefined;
      coverPath =
        typeof json.coverImage === 'string' && json.coverImage.trim()
          ? json.coverImage.trim()
          : undefined;
      if (json.portfolioImages !== undefined) {
        if (Array.isArray(json.portfolioImages)) {
          portfolioImagesParsed = (json.portfolioImages as unknown[]).filter(
            (p: unknown): p is string => typeof p === 'string' && p.trim().length > 0
          );
        } else if (typeof json.portfolioImages === 'string') {
          portfolioImagesParsed = parsePortfolioImages(json.portfolioImages);
        }
      }
    }

    if (portfolioPathsFromUpload.length > 0) {
      const merged = [...(portfolioImagesParsed ?? []), ...portfolioPathsFromUpload];
      portfolioImagesParsed = parsePortfolioImages(serializePortfolioImages(merged));
    } else if (portfolioImagesParsed !== undefined) {
      portfolioImagesParsed = parsePortfolioImages(serializePortfolioImages(portfolioImagesParsed));
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
    let listingDisplayMode: ListingDisplayMode | undefined;
    if (body.listingDisplayMode === 'all' || body.listingDisplayMode === 'manual') {
      listingDisplayMode = body.listingDisplayMode;
    }
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
        instagram: body.instagram != null ? normalizeInstagramForStorage(String(body.instagram)) : null,
        website: body.website != null ? normalizeWebsiteForStorage(String(body.website)) : null,
        workingHours: body.workingHours ? String(body.workingHours) : null,
        logo: logoPath,
        coverImage: coverPath,
        plan: plan as 'business' | 'business_pro' | null | undefined,
        listingIds,
        listingDisplayMode,
        portfolioImages: portfolioImagesParsed,
      },
      { partial: isPartial }
    );

    const listingConfigTouched =
      listingDisplayMode !== undefined ||
      (listingIdsRaw != null && String(listingIdsRaw).trim() !== '');

    const profile = await prisma.businessProfile.findUnique({ where: { id: profileId } });

    if (profile && isBusinessProfileActive(profile) && listingConfigTouched) {
      try {
        const resolvedIds = await resolveBusinessListingIds(user.id, profile.linkedListingIds);
        await assignListingsToProfile(user.id, resolvedIds);
      } catch (assignError) {
        console.error('[BusinessProfile PUT] assign listings failed', assignError);
      }
    }

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error('[BusinessProfile PUT]', error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to save business profile', details },
      { status: 500 }
    );
  }
}
