import { NextRequest, NextResponse } from 'next/server';
import { findUserByTelegramId, getUserBalance, getUserIdAndActive, parseTelegramId } from '@/utils/userHelpers';
import { updateUserBalance } from '@/utils/userHelpers';
import { createTransaction } from '@/utils/dbHelpers';

// Отримати баланс користувача
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const telegramIdRaw = searchParams.get('telegramId');

    if (!telegramIdRaw) {
      return NextResponse.json(
        { error: 'Telegram ID is required' },
        { status: 400 }
      );
    }

    const telegramId = parseTelegramId(telegramIdRaw);
    const u = await getUserIdAndActive(telegramId);
    if (!u) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!u.isActive) {
      return NextResponse.json({ error: 'blocked' }, { status: 403 });
    }

    const balance = await getUserBalance(telegramId);

    if (!balance) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(balance);
  } catch (error) {
    console.error('Error fetching balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch balance' },
      { status: 500 }
    );
  }
}

// Оновити баланс (внутрішній метод, може використовуватися після оплати)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { telegramId: telegramIdRaw, amount, type, description } = body;

    if (!telegramIdRaw || amount === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const telegramId = parseTelegramId(telegramIdRaw);
    const u = await getUserIdAndActive(telegramId);
    if (!u) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!u.isActive) {
      return NextResponse.json({ error: 'blocked' }, { status: 403 });
    }

    const user = await findUserByTelegramId(telegramId);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const newBalance = await updateUserBalance(
      user.id, 
      amount, 
      type === 'deduct' ? 'deduct' : 'add'
    );

    // Створюємо транзакцію
    await createTransaction({
      userId: user.id,
      type: type === 'deduct' ? 'payment' : 'refund',
      amount: Math.abs(amount),
      currency: 'EUR',
      status: 'completed',
      description: description || null,
    });

    return NextResponse.json({
      success: true,
      newBalance,
    });
  } catch (error) {
    console.error('Error updating balance:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Insufficient balance') {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to update balance' },
      { status: 500 }
    );
  }
}
