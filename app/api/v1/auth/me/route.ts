import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const sessionUser = await validateSession();

    if (!sessionUser) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        employeeId: true,
        name: true,
        email: true,
        departmentId: true,
        costCenterId: true,
        cabFacility: true,
        defaultPickupLocation: true,
        defaultPickupTime: true,
        defaultDropLocation: true,
        defaultDropTime: true,
        department: { select: { name: true } },
        costCenter: { select: { name: true, code: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        roles: sessionUser.roles,
        highestRole: sessionUser.highestRole,
      },
    });
  } catch (error) {
    console.error('Auth/me error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch user' } },
      { status: 500 }
    );
  }
}
