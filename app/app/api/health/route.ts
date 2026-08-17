import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Liveness for Docker healthcheck — без запитів до БД. */
export async function GET() {
  return NextResponse.json({ ok: true, service: 'app' }, { status: 200 });
}
