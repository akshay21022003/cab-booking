import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateSession } from '@/lib/auth';

/**
 * GET /api/v1/super-admin/users/search?q=searchterm
 * Search users by name or employee ID for admin assignment dropdown
 */
export async function GET(request: NextRequest) {
  try {
    const user = await validateSession();
    if (!user || user.highestRole !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    if (query.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const users = await db.user.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { employeeId: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        employeeId: true,
        name: true,
        email: true,
        department: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
      take: 10,
    });

    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    console.error('GET user search error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Search failed' } },
      { status: 500 }
    );
  }
}
