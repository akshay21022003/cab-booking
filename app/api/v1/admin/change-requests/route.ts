import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateSession } from '@/lib/auth';

/**
 * GET /api/v1/admin/change-requests - Get change requests (paginated)
 * Access: DEPARTMENT_ADMIN, SUPER_ADMIN
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'PENDING';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 15;
    const departmentId = searchParams.get('department_id');

    const where: Record<string, unknown> = { status };

    if (user.highestRole === 'DEPARTMENT_ADMIN') {
      where.booking = { departmentId: user.departmentId };
    } else if (departmentId) {
      where.booking = { departmentId };
    }

    const [changeRequests, total] = await Promise.all([
      db.changeRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          booking: {
            select: {
              id: true, bookingDate: true, bookingType: true,
              pickupLocation: true, pickupTime: true,
              dropLocation: true, dropTime: true, departmentId: true,
            },
          },
          user: { select: { name: true, employeeId: true } },
        },
      }),
      db.changeRequest.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: changeRequests,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Admin GET change-requests error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch' } },
      { status: 500 }
    );
  }
}
