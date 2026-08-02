import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateSession } from '@/lib/auth';

/**
 * GET /api/v1/admin/bookings - Get all bookings in admin's department
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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 20;
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const departmentId = searchParams.get('department_id');
    const showCancelled = searchParams.get('show_cancelled') === 'true';

    const where: Record<string, unknown> = {};

    // Department admin sees only their department
    if (user.highestRole === 'DEPARTMENT_ADMIN') {
      where.departmentId = user.departmentId;
    } else if (departmentId) {
      where.departmentId = departmentId;
    }

    if (!showCancelled) {
      where.isCancelled = false;
    }

    if (startDate || endDate) {
      where.bookingDate = {};
      if (startDate) (where.bookingDate as Record<string, unknown>).gte = new Date(startDate);
      if (endDate) (where.bookingDate as Record<string, unknown>).lte = new Date(endDate);
    }

    const [bookings, total] = await Promise.all([
      db.booking.findMany({
        where,
        orderBy: { bookingDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { name: true, employeeId: true, cabFacility: true } },
          costCenter: { select: { name: true, code: true } },
          changeRequests: { where: { status: 'PENDING' }, take: 1 },
        },
      }),
      db.booking.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: bookings,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Admin GET bookings error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch bookings' } },
      { status: 500 }
    );
  }
}
