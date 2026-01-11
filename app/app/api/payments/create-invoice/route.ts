import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const MONOBANK_API_URL = process.env.MONOBANK_API_URL || 'https://api.monobank.ua';
const MONOBANK_TOKEN = process.env.MONOBANK_TOKEN;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
const WEBAPP_URL = process.env.WEBAPP_URL || BASE_URL;

/**
 * Створення інвойсу для поповнення балансу
 * POST /api/payments/create-invoice
 * Body: { telegramId: string, amount: number } (amount в EUR, буде конвертовано в копійки)
 */
export async function POST(request: NextRequest) {
  try {
    if (!MONOBANK_TOKEN) {
      return NextResponse.json(
        { error: 'Monobank token is not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { telegramId, amount } = body;

    if (!telegramId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: 'telegramId and amount (positive number) are required' },
        { status: 400 }
      );
    }

    // Конвертуємо EUR в центи (1 EUR = 100 центів)
    const amountInCents = Math.round(amount * 100);
    const currencyCode = 978; // ISO 4217 код для EUR

    // Знаходимо користувача
    const telegramIdNum = parseInt(telegramId.toString());
    const users = await prisma.$queryRawUnsafe(
      `SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?`,
      telegramIdNum
    ) as Array<{ id: number }>;

    if (!users[0]) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userId = users[0].id;

    // Створюємо інвойс через Monobank API
    const invoiceData = {
      amount: amountInCents,
      ccy: currencyCode,
      merchantPaymInfo: {
        reference: `balance-${userId}-${Date.now()}`,
        destination: `Поповнення балансу на ${amount} EUR`,
        comment: `Поповнення балансу користувача ${telegramId}`,
        customerEmails: [],
        basketOrder: [
          {
            name: 'Поповнення балансу',
            qty: 1,
            sum: amountInCents,
            total: amountInCents,
            icon: null,
            unit: 'шт.',
            code: `balance-${userId}-${Date.now()}`,
          }
        ]
      },
      redirectUrl: `${WEBAPP_URL}/api/payments/redirect?telegramId=${telegramId}`,
      successUrl: `${WEBAPP_URL}/api/payments/success?telegramId=${telegramId}`,
      failUrl: `${WEBAPP_URL}/api/payments/fail?telegramId=${telegramId}`,
      webHookUrl: `${WEBAPP_URL}/api/payments/webhook`,
      validity: 3600, // 1 година
      paymentType: 'debit' as const,
    };

    const response = await fetch(`${MONOBANK_API_URL}/api/merchant/invoice/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Token': MONOBANK_TOKEN,
      },
      body: JSON.stringify(invoiceData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Monobank API error:', errorText);
      return NextResponse.json(
        { error: 'Failed to create invoice', details: errorText },
        { status: response.status }
      );
    }

    const invoiceResponse = await response.json();
    const { invoiceId, pageUrl } = invoiceResponse;

    if (!invoiceId || !pageUrl) {
      return NextResponse.json(
        { error: 'Invalid response from Monobank API' },
        { status: 500 }
      );
    }

    // Зберігаємо платіж в базу даних
    const createTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const { executeWithRetry } = await import('@/lib/prisma');

    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `INSERT INTO Payment (userId, invoiceId, amount, amountEur, currency, status, pageUrl, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?)`,
        userId,
        invoiceId,
        amountInCents, // Сума в центах EUR
        amount, // Сума в EUR
        'EUR',
        pageUrl,
        createTime,
        createTime
      )
    );

    return NextResponse.json({
      invoiceId,
      pageUrl,
      amount,
      currency: 'EUR',
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
