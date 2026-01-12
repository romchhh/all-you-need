import { NextRequest, NextResponse } from 'next/server';
import { createMonobankInvoice } from '@/lib/monobank';

/**
 * Створення інвойсу для поповнення балансу або оплати промо/пакетів
 * POST /api/payments/create-invoice
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[Create Invoice API] Starting...');

    const body = await request.json();
    console.log('[Create Invoice API] Request body:', body);

    const result = await createMonobankInvoice(body);

    console.log('[Create Invoice API] Success:', result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Create Invoice API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
