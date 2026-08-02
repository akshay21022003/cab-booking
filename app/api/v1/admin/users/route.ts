import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { createUserSchema } from '@/lib/schemas';
import { createAuditLog } from '@/lib/audit';
import { Role } from '@/lib/types';

/**
 * GET /api/v1/admin/users - List users (paginated, department filterable)
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
    const limit = 15;
    const departmentId = searchParams.get('department_id');

    const where: Record<string, unknown> = {};
    if (user.highestRole === 'DEPARTMENT_ADMIN') {
      where.departmentId = user.departmentId;
    } else if (departmentId) {
      where.departmentId = departmentId;
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          employeeId: true,
          name: true,
          email: true,
          isActive: true,
          cabFacility: true,
          defaultPickupLocation: true,
          defaultPickupTime: true,
          defaultDropLocation: true,
          defaultDropTime: true,
          costCenter: { select: { name: true, code: true } },
          roles: { select: { role: true } },
        },
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Admin GET users error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch users' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/admin/users - Create a new user
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: parsed.error.flatten().fieldErrors },
        },
        { status: 400 }
      );
    }

    const {
      employeeId, name, email, costCenterId, cabFacility,
      defaultPickupLocation, defaultPickupTime, defaultDropLocation, defaultDropTime,
    } = parsed.data;

    const existing = await db.user.findUnique({ where: { employeeId } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE', message: 'Employee ID already exists' } },
        { status: 409 }
      );
    }

    const newUser = await db.user.create({
      data: {
        employeeId,
        name,
        email: email || null,
        departmentId: user.departmentId,
        costCenterId: costCenterId || null,
        cabFacility: cabFacility || 'BOTH',
        defaultPickupLocation: defaultPickupLocation || null,
        defaultPickupTime: defaultPickupTime || null,
        defaultDropLocation: defaultDropLocation || null,
        defaultDropTime: defaultDropTime || null,
      },
    });

    // Assign USER role
    await db.userRole.create({
      data: { userId: newUser.id, role: Role.USER, departmentId: user.departmentId },
    });

    await createAuditLog({
      entityType: 'user',
      entityId: newUser.id,
      action: 'created',
      actorId: user.id,
      newValue: { employeeId, name, cabFacility },
    });

    return NextResponse.json({ success: true, data: newUser }, { status: 201 });
  } catch (error) {
    console.error('Admin POST user error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create user' } },
      { status: 500 }
    );
  }
}
