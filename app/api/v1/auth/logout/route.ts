import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionToken, clearSessionCookie } from '@/lib/auth';

export async function POST() {
  try {
    const token = await getSessionToken();

    if (token) {
      // Revoke the current session
      await db.session.updateMany({
        where: { token },
        data: { isRevoked: true },
      });
    }

    await clearSessionCookie();

    return NextResponse.json({ success: true, data: { message: 'Logged out' } });
  } catch (error) {
    console.error('Logout error:', error);
    await clearSessionCookie();
    return NextResponse.json({ success: true, data: { message: 'Logged out' } });
  }
}
