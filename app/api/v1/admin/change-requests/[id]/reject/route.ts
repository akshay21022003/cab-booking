import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { approveRejectSchema } from '@/lib/schemas';
import { createAuditLog } from '@/lib/audit';

/**
 * PUT /api/v1/admin/change-requests/:id/reject
 * Booking remains unchanged.
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

    const body = await request.json();
    const parsed = approveRejectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } },
        { status: 400 }
      );
    }

    const { adminResponse } = parsed.data;

    const changeRequest = await db.changeRequest.findUnique({
      where: { id: params.id },
      include: { booking: true },
    });

    if (!changeRequest) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Change request not found' } },
        { status: 404 }
      );
    }

    if (changeRequest.status !== 'PENDING') {
      return NextResponse.json(
        { success: false, error: { code: 'ALREADY_PROCESSED', message: 'Already processed' } },
        { status: 400 }
      );
    }

    if (
      user.highestRole === 'DEPARTMENT_ADMIN' &&
      changeRequest.booking.departmentId !== user.departmentId
    ) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Not in your department' } },
        { status: 403 }
      );
    }

    const rejected = await db.changeRequest.update({
      where: { id: params.id },
      data: { status: 'REJECTED', adminResponse: adminResponse || 'Rejected' },
    });

    await db.notification.create({
      data: {
        userId: changeRequest.userId,
        title: 'Change request rejected',
        message: `Your change request was rejected.${adminResponse ? ` Reason: ${adminResponse}` : ''}`,
        link: `/dashboard/user`,
      },
    });

    await createAuditLog({
      entityType: 'change_request',
      entityId: params.id,
      action: 'rejected',
      actorId: user.id,
      newValue: { adminResponse },
    });

    return NextResponse.json({ success: true, data: rejected });
  } catch (error) {
    console.error('Reject change-request error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to reject' } },
      { status: 500 }
    );
  }
}
