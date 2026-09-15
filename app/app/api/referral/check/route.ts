import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const telegramIdRaw = body?.telegramId;
    if (telegramIdRaw == null || String(telegramIdRaw).trim() === '') {
      return NextResponse.json({ error: 'Missing telegramId' }, { status: 400 });
    }

    const telegramId = BigInt(String(telegramIdRaw));

    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ success: true, rewardPaid: false });
    }

    const [marketplaceCount, telegramCount] = await Promise.all([
      prisma.listing.count({
        where: {
          userId: user.id,
          OR: [{ status: 'active' }, { moderationStatus: 'approved' }],
        },
      }),
      prisma.telegramListing.count({
        where: {
          userId: user.id,
          OR: [{ status: 'approved' }, { moderationStatus: 'approved' }],
        },
      }),
    ]);

    if (marketplaceCount + telegramCount !== 1) {
      return NextResponse.json({ success: true, rewardPaid: false });
    }

    const referral = await prisma.referral.findFirst({
      where: { referredTelegramId: telegramId, rewardPaid: 0 },
    });

    if (!referral) {
      return NextResponse.json({ success: true, rewardPaid: false });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { telegramId: referral.referrerTelegramId },
        data: { balance: { increment: 1 } },
      }),
      prisma.referral.update({
        where: { id: referral.id },
        data: { rewardPaid: 1, rewardPaidAt: new Date() },
      }),
    ]);

    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        const rewardText =
          '💰 <b>Винагорода отримана!</b>\n\nЗа вашим посиланням запрошений користувач подав своє перше оголошення.\n\nВам нараховано <b>1€</b> на баланс!';

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: referral.referrerTelegramId.toString(),
            text: rewardText,
            parse_mode: 'HTML',
          }),
        });
      }
    } catch (error) {
      console.error('[Referral] Error sending notification:', error);
    }

    return NextResponse.json({
      success: true,
      rewardPaid: true,
      referrerTelegramId: referral.referrerTelegramId.toString(),
    });
  } catch (error: any) {
    console.error('[Referral Check API] Error:', error);
    return NextResponse.json(
      { success: true, rewardPaid: false, error: 'Referral check skipped' },
      { status: 200 }
    );
  }
}
