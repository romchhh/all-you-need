import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry } from '@/lib/prisma';
import { requireAdminAuth } from '@/utils/adminAuth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAuth();

    const { id } = await params;
    const listingId = parseInt(id, 10);

    if (isNaN(listingId)) {
      return NextResponse.json(
        { error: 'Invalid listing ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status } = body;

    const validStatuses = ['pending', 'approved', 'rejected', 'active', 'sold', 'expired', 'hidden'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    // Оновлюємо статус
    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        `UPDATE Listing SET status = ?, updatedAt = CURRENT_TIMESTAMP, publishedAt = CASE WHEN ? = 'active' AND publishedAt IS NULL THEN CURRENT_TIMESTAMP ELSE publishedAt END WHERE id = ?`,
        status,
        status,
        listingId
      )
    );

    return NextResponse.json({ success: true, status });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Error updating listing status:', error);
    return NextResponse.json(
      { error: 'Failed to update listing status' },
      { status: 500 }
    );
  }
}
