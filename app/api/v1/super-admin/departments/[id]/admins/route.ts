import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';
import { Role } from '@prisma/client';

const assignAdminSchema = z.object({
  employeeId: z.string().min(1),
});

/**
 * POST /api/v1/super-admin/departments/:id/admins - Assign admin to department
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await validateSession();
    if (!user || user.highestRole !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = assignAdminSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Employee ID required' } },
        { status: 400 }
      );
    }

    const targetUser = await db.user.findUnique({ where: { employeeId: parsed.data.employeeId } });
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } },
        { status: 404 }
      );
    }

    // Add department admin role
    await db.userRole.upsert({
      where: { userId_role_departmentId: { userId: targetUser.id, role: Role.DEPARTMENT_ADMIN, departmentId: params.id } },
      update: {},
      create: { userId: targetUser.id, role: Role.DEPARTMENT_ADMIN, departmentId: params.id },
    });

    // Add to department_admins table
    await db.departmentAdmin.upsert({
      where: { departmentId_userId: { departmentId: params.id, userId: targetUser.id } },
      update: {},
      create: { departmentId: params.id, userId: targetUser.id },
    });

    await createAuditLog({
      entityType: 'department', entityId: params.id, action: 'admin_assigned',
      actorId: user.id, newValue: { employeeId: parsed.data.employeeId, userName: targetUser.name },
    });

    return NextResponse.json({ success: true, data: { message: `${targetUser.name} assigned as admin` } });
  } catch (error) {
    console.error('POST assign admin error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to assign admin' } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/super-admin/departments/:id/admins - Remove admin from department
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await validateSession();
    if (!user || user.highestRole !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'userId required' } },
        { status: 400 }
      );
    }

    await db.departmentAdmin.deleteMany({ where: { departmentId: params.id, userId } });
    await db.userRole.deleteMany({ where: { userId, role: Role.DEPARTMENT_ADMIN, departmentId: params.id } });

    await createAuditLog({
      entityType: 'department', entityId: params.id, action: 'admin_removed',
      actorId: user.id, newValue: { removedUserId: userId },
    });

    return NextResponse.json({ success: true, data: { message: 'Admin removed' } });
  } catch (error) {
    console.error('DELETE admin error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to remove admin' } },
      { status: 500 }
    );
  }
}
