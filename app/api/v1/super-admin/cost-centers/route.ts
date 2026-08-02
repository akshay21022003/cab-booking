import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';

const createCCSchema = z.object({
  name: z.string().min(1, 'Required').max(100),
  code: z.string().min(1, 'Required').max(20).regex(/^[A-Z0-9-]+$/, 'Must be uppercase alphanumeric with dashes'),
  departmentId: z.string().min(1, 'Required'),
});

/**
 * GET /api/v1/super-admin/cost-centers
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
    const departmentId = searchParams.get('department_id');

    const where: Record<string, unknown> = {};
    if (departmentId) where.departmentId = departmentId;

    const costCenters = await db.costCenter.findMany({
      where,
      orderBy: { code: 'asc' },
      include: {
        department: { select: { name: true } },
        _count: { select: { users: true } },
      },
    });

    return NextResponse.json({ success: true, data: costCenters });
  } catch (error) {
    console.error('GET cost-centers error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/super-admin/cost-centers
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
    const parsed = createCCSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: parsed.error.flatten().fieldErrors } },
        { status: 400 }
      );
    }

    const existing = await db.costCenter.findUnique({ where: { code: parsed.data.code } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE', message: 'Cost center code already exists' } },
        { status: 409 }
      );
    }

    const cc = await db.costCenter.create({ data: parsed.data });

    await createAuditLog({
      entityType: 'cost_center', entityId: cc.id, action: 'created',
      actorId: user.id, newValue: parsed.data,
    });

    return NextResponse.json({ success: true, data: cc }, { status: 201 });
  } catch (error) {
    console.error('POST cost-center error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create' } },
      { status: 500 }
    );
  }
}
