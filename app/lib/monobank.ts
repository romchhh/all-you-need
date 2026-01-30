import { prisma } from '@/lib/prisma';
import { getUserLanguage } from '@/utils/userHelpers';

const MONOBANK_API_URL = process.env.MONOBANK_API_URL || 'https://api.monobank.ua';
const MONOBANK_TOKEN = process.env.MONOBANK_TOKEN;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
const WEBAPP_URL = process.env.WEBAPP_URL || BASE_URL;

export interface CreateInvoiceParams {
  telegramId: string;
  amount: number;
  type?: 'balance' | 'promotion' | 'package';
  promotionType?: string;
  packageType?: string;
  listingId?: number;
  description?: string;
}

export interface InvoiceResult {
  invoiceId: string;
  pageUrl: string;
  amount: number;
  currency: string;
  type: string;
}

/**
 * Створює інвойс через Monobank API
 */
export async function createMonobankInvoice(params: CreateInvoiceParams): Promise<InvoiceResult> {
  const { telegramId, amount, type = 'balance', promotionType, packageType, listingId, description } = params;

  console.log('[Monobank] Creating invoice:', { telegramId, amount, type, promotionType, packageType, listingId });

  if (!MONOBANK_TOKEN) {
    throw new Error('Monobank token is not configured');
  }

  if (!telegramId || !amount || amount <= 0) {
    throw new Error('telegramId and amount (positive number) are required');
  }

  // Конвертуємо EUR в центи
  const amountInCents = Math.round(amount * 100);
  const currencyCode = 978; // EUR

  // Знаходимо користувача
  const telegramIdStr = telegramId.toString();
  const users = await prisma.$queryRawUnsafe(
    `SELECT id FROM User WHERE CAST(telegramId AS TEXT) = ?`,
    telegramIdStr
  ) as Array<{ id: number }>;

  if (!users[0]) {
    console.error('[Monobank] User not found:', telegramIdStr);
    throw new Error('User not found');
  }

  const userId = users[0].id;
  const userLang = await getUserLanguage(telegramIdStr);
  console.log('[Monobank] User found:', { userId, telegramId: telegramIdStr, type });

  // Формуємо дані залежно від типу платежу
  let reference: string;
  let destination: string;
  let comment: string;
  let itemName: string;

  switch (type) {
    case 'promotion':
      reference = `promo-${userId}-${listingId || 'none'}-${Date.now()}`;
      destination = description || `Реклама оголошення`;
      comment = `Промо ${promotionType} для користувача ${telegramId}`;
      itemName = description || `Реклама: ${promotionType}`;
      break;
    case 'package':
      reference = `package-${userId}-${Date.now()}`;
      destination = description || `Покупка пакету оголошень`;
      comment = `Пакет ${packageType} для користувача ${telegramId}`;
      itemName = description || `Пакет: ${packageType}`;
      break;
    case 'balance':
    default:
      reference = `balance-${userId}-${Date.now()}`;
      destination = `Поповнення балансу на ${amount} EUR`;
      comment = `Поповнення балансу користувача ${telegramId}`;
      itemName = 'Поповнення балансу';
      break;
  }

  // Створюємо інвойс через Monobank API
  const invoiceData = {
    amount: amountInCents,
    ccy: currencyCode,
    merchantPaymInfo: {
      reference,
      destination,
      comment,
      customerEmails: [],
      basketOrder: [
        {
          name: itemName,
          qty: 1,
          sum: amountInCents,
          total: amountInCents,
          icon: null,
          unit: 'шт.',
          code: reference,
        }
      ]
    },
    redirectUrl: `${WEBAPP_URL}/${userLang}/profile?telegramId=${telegramId}`,
    webHookUrl: `${WEBAPP_URL}/api/payments/webhook`,
    validity: 3600,
    paymentType: 'debit' as const,
    saveCardData: {
      saveCard: false,
    },
  };

  console.log('[Monobank] Creating invoice with data:', { 
    reference, 
    amount: amountInCents,
    redirectUrl: invoiceData.redirectUrl,
    webHookUrl: invoiceData.webHookUrl
  });

  const response = await fetch(`${MONOBANK_API_URL}/api/merchant/invoice/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': MONOBANK_TOKEN,
    },
    body: JSON.stringify(invoiceData),
  });

  console.log('[Monobank] Response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Monobank] API error:', errorText);
    throw new Error(`Failed to create invoice: ${errorText}`);
  }

  const invoiceResponse = await response.json();
  console.log('[Monobank] Invoice created:', invoiceResponse);

  const { invoiceId, pageUrl } = invoiceResponse;

  if (!invoiceId || !pageUrl) {
    console.error('[Monobank] Missing invoiceId or pageUrl');
    throw new Error('Invalid response from Monobank API');
  }

  // Зберігаємо платіж в базу даних (для всіх типів)
  console.log('[Monobank] Saving payment record to database');
  const createTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const { executeWithRetry } = await import('@/lib/prisma');

  await executeWithRetry(() =>
    prisma.$executeRawUnsafe(
      `INSERT INTO Payment (userId, invoiceId, amount, amountEur, currency, status, pageUrl, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?)`,
      userId,
      invoiceId,
      amountInCents,
      amount,
      'EUR',
      pageUrl,
      createTime,
      createTime
    )
  );

  console.log('[Monobank] Returning success response');

  return {
    invoiceId,
    pageUrl,
    amount,
    currency: 'EUR',
    type,
  };
}
