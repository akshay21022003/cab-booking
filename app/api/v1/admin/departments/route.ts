import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateSession } from '@/lib/auth';

/**
 * GET /api/v1/admin/departments - List departments for filter dropdown
 * Returns all departments for SUPER_ADMIN, own department for DEPARTMENT_ADMIN
 */
export async function GET() {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    if (user.highestRole !== 'DEPARTMENT_ADMIN' && user.highestRole !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    if (user.highestRole === 'SUPER_ADMIN') {
      const departments = await db.department.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
      return NextResponse.json({ success: true, data: departments, isSuperAdmin: true });
    }

    // Department admin only sees their own
    const dept = await db.department.findUnique({
      where: { id: user.departmentId },
      select: { id: true, name: true },
    });
    return NextResponse.json({ success: true, data: dept ? [dept] : [], isSuperAdmin: false });
  } catch (error) {
    console.error('GET departments error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch' } },
      { status: 500 }
    );
  }
}
