import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { updateUserSchema } from '@/lib/schemas';
import { createAuditLog } from '@/lib/audit';

/**
 * PUT /api/v1/admin/users/:id - Update user details
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const targetUser = await db.user.findUnique({ where: { id: params.id } });
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }

    // Department admin can only edit users in their department
    if (user.highestRole === 'DEPARTMENT_ADMIN' && targetUser.departmentId !== user.departmentId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Not in your department' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: parsed.error.flatten().fieldErrors } },
        { status: 400 }
      );
    }

    const {
      name, email, costCenterId, cabFacility,
      defaultPickupLocation, defaultPickupTime, defaultDropLocation, defaultDropTime,
    } = parsed.data;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email || null;
    if (costCenterId !== undefined) updateData.costCenterId = costCenterId || null;
    if (cabFacility !== undefined) updateData.cabFacility = cabFacility;
    if (defaultPickupLocation !== undefined) updateData.defaultPickupLocation = defaultPickupLocation || null;
    if (defaultPickupTime !== undefined) updateData.defaultPickupTime = defaultPickupTime || null;
    if (defaultDropLocation !== undefined) updateData.defaultDropLocation = defaultDropLocation || null;
    if (defaultDropTime !== undefined) updateData.defaultDropTime = defaultDropTime || null;

    const updated = await db.user.update({
      where: { id: params.id },
      data: updateData,
    });

    await createAuditLog({
      entityType: 'user',
      entityId: params.id,
      action: 'updated',
      actorId: user.id,
      oldValue: { name: targetUser.name, cabFacility: targetUser.cabFacility },
      newValue: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Admin PUT user error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update user' } },
      { status: 500 }
    );
  }
}
