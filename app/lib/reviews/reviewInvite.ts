import { prisma } from '@/lib/prisma';
import {
  ensureBusinessReviewInviteTable,
  ensureReviewExtraColumns,
} from '@/lib/reviews/reviewService';
import { notifyUserReviewInvite } from '@/lib/reviews/reviewNotify';

const INVITE_DELAY_MS = 3 * 24 * 60 * 60 * 1000;

/** Запам'ятовує контакт «Написати» — через 3 дні надішлемо запрошення на відгук. */
export async function scheduleBusinessReviewInvite(params: {
  viewerUserId: number;
  businessUserId: number;
  businessProfileId?: number | null;
  businessName?: string | null;
}): Promise<void> {
  if (params.viewerUserId === params.businessUserId) return;

  await ensureBusinessReviewInviteTable();

  const due = new Date(Date.now() + INVITE_DELAY_MS);
  const existing = await prisma.businessReviewInvite.findUnique({
    where: {
      viewerUserId_businessUserId: {
        viewerUserId: params.viewerUserId,
        businessUserId: params.businessUserId,
      },
    },
  });

  if (existing) {
    // Не спамимо: якщо вже відправили / завершили / відхилили — не перестворюємо
    if (existing.status === 'completed' || existing.status === 'declined') return;
    if (existing.status === 'sent') return;
    // pending — оновлюємо due (новий контакт = +3 дні від зараз)
    await prisma.businessReviewInvite.update({
      where: { id: existing.id },
      data: {
        inviteDueAt: due,
        businessName: params.businessName ?? existing.businessName,
        businessProfileId: params.businessProfileId ?? existing.businessProfileId,
        contactedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return;
  }

  // Якщо вже є відгук — не плануємо
  const prior = await prisma.review.findFirst({
    where: { userId: params.viewerUserId, targetId: params.businessUserId },
    select: { id: true },
  });
  if (prior) return;

  await prisma.businessReviewInvite.create({
    data: {
      viewerUserId: params.viewerUserId,
      businessUserId: params.businessUserId,
      businessProfileId: params.businessProfileId ?? null,
      businessName: params.businessName ?? null,
      inviteDueAt: due,
      status: 'pending',
    },
  });
}

export async function declineBusinessReviewInvite(inviteId: number, viewerUserId: number): Promise<boolean> {
  await ensureBusinessReviewInviteTable();
  const row = await prisma.businessReviewInvite.findUnique({ where: { id: inviteId } });
  if (!row || row.viewerUserId !== viewerUserId) return false;
  await prisma.businessReviewInvite.update({
    where: { id: inviteId },
    data: { status: 'declined', updatedAt: new Date() },
  });
  return true;
}

/** Cron: надіслати due invites. */
export async function processDueBusinessReviewInvites(limit = 40): Promise<{ sent: number; failed: number }> {
  await ensureBusinessReviewInviteTable();
  await ensureReviewExtraColumns();

  const now = new Date();
  const due = await prisma.businessReviewInvite.findMany({
    where: {
      status: 'pending',
      inviteDueAt: { lte: now },
    },
    orderBy: { inviteDueAt: 'asc' },
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const invite of due) {
    try {
      const alreadyReviewed = await prisma.review.findFirst({
        where: { userId: invite.viewerUserId, targetId: invite.businessUserId },
        select: { id: true },
      });
      if (alreadyReviewed) {
        await prisma.businessReviewInvite.update({
          where: { id: invite.id },
          data: { status: 'completed', updatedAt: new Date() },
        });
        continue;
      }

      const [viewer, owner, profile] = await Promise.all([
        prisma.user.findUnique({
          where: { id: invite.viewerUserId },
          select: { telegramId: true, agreementAccepted: true },
        }),
        prisma.user.findUnique({
          where: { id: invite.businessUserId },
          select: { telegramId: true },
        }),
        prisma.businessProfile.findUnique({
          where: { userId: invite.businessUserId },
          select: { businessName: true },
        }),
      ]);

      if (!viewer?.telegramId || !owner?.telegramId || !viewer.agreementAccepted) {
        await prisma.businessReviewInvite.update({
          where: { id: invite.id },
          data: { status: 'declined', updatedAt: new Date() },
        });
        continue;
      }

      const ok = await notifyUserReviewInvite({
        viewerTelegramId: viewer.telegramId,
        businessName: invite.businessName || profile?.businessName || 'Business',
        sellerTelegramId: String(owner.telegramId),
        inviteId: invite.id,
      });

      if (ok) {
        await prisma.businessReviewInvite.update({
          where: { id: invite.id },
          data: { status: 'sent', inviteSentAt: new Date(), updatedAt: new Date() },
        });
        sent += 1;
      } else {
        failed += 1;
      }
    } catch (e) {
      console.error('[processDueBusinessReviewInvites]', invite.id, e);
      failed += 1;
    }
  }

  return { sent, failed };
}

export async function viewerHadTradeGroundContact(
  viewerUserId: number,
  businessUserId: number
): Promise<boolean> {
  await ensureBusinessReviewInviteTable();
  const invite = await prisma.businessReviewInvite.findUnique({
    where: {
      viewerUserId_businessUserId: {
        viewerUserId,
        businessUserId,
      },
    },
    select: { id: true },
  });
  return Boolean(invite);
}
