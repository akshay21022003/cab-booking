import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';

const updateDeptSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

/**
 * PUT /api/v1/super-admin/departments/:id
 */
export async function PUT(
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

    const dept = await db.department.findUnique({ where: { id: params.id } });
    if (!dept) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Department not found' } },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = updateDeptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data' } },
        { status: 400 }
      );
    }

    const updated = await db.department.update({
      where: { id: params.id },
      data: parsed.data,
    });

    await createAuditLog({
      entityType: 'department', entityId: params.id, action: 'updated',
      actorId: user.id, oldValue: { name: dept.name, isActive: dept.isActive },
      newValue: parsed.data,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('PUT department error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update' } },
      { status: 500 }
    );
  }
}
