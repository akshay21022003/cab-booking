import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';

const createDeptSchema = z.object({
  name: z.string().min(1, 'Required').max(100),
});

/**
 * GET /api/v1/super-admin/departments
 */
export async function GET() {
  try {
    const user = await validateSession();
    if (!user || user.highestRole !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } },
        { status: 403 }
      );
    }

    const departments = await db.department.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { users: true, costCenters: true } },
        departmentAdmins: {
          include: { user: { select: { name: true, employeeId: true } } },
        },
      },
    });

    return NextResponse.json({ success: true, data: departments });
  } catch (error) {
    console.error('GET departments error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/super-admin/departments
 */
export async function POST(request: NextRequest) {
  try {
    const user = await validateSession();
    if (!user || user.highestRole !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = createDeptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data' } },
        { status: 400 }
      );
    }

    const existing = await db.department.findUnique({ where: { name: parsed.data.name } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE', message: 'Department name already exists' } },
        { status: 409 }
      );
    }

    const dept = await db.department.create({ data: { name: parsed.data.name } });

    await createAuditLog({
      entityType: 'department', entityId: dept.id, action: 'created',
      actorId: user.id, newValue: { name: parsed.data.name },
    });

    return NextResponse.json({ success: true, data: dept }, { status: 201 });
  } catch (error) {
    console.error('POST department error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create' } },
      { status: 500 }
    );
  }
}
