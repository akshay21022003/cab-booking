import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { approveRejectSchema } from '@/lib/schemas';
import { createAuditLog } from '@/lib/audit';

/**
 * PUT /api/v1/admin/change-requests/:id/approve
 * 
 * Transaction:
 * 1. Validate change request is PENDING
 * 2. Update booking with requested value
 * 3. Set change_request.status = APPROVED
 * 4. Notify user
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

    const result = await db.$transaction(async (tx) => {
      const changeRequest = await tx.changeRequest.findUnique({
        where: { id: params.id },
        include: { booking: true },
      });

      if (!changeRequest) throw new Error('NOT_FOUND');
      if (changeRequest.status !== 'PENDING') throw new Error('ALREADY_PROCESSED');

      // Department admin scope check
      if (
        user.highestRole === 'DEPARTMENT_ADMIN' &&
        changeRequest.booking.departmentId !== user.departmentId
      ) {
        throw new Error('FORBIDDEN');
      }

      // Build booking update
      const bookingUpdate: Record<string, unknown> = {};

      if (changeRequest.requestedField === 'CANCEL_BOOKING') {
        bookingUpdate.isCancelled = true;
      } else if (changeRequest.requestedField === 'CANCEL_PICKUP') {
        // Convert BOTH → DROP only, clear pickup fields
        bookingUpdate.bookingType = 'DROP';
        bookingUpdate.pickupLocation = null;
        bookingUpdate.pickupTime = null;
      } else if (changeRequest.requestedField === 'CANCEL_DROP') {
        // Convert BOTH → PICKUP only, clear drop fields
        bookingUpdate.bookingType = 'PICKUP';
        bookingUpdate.dropLocation = null;
        bookingUpdate.dropTime = null;
      } else {
        const fieldMap: Record<string, string> = {
          PICKUP_LOCATION: 'pickupLocation',
          DROP_LOCATION: 'dropLocation',
          PICKUP_TIME: 'pickupTime',
          DROP_TIME: 'dropTime',
        };
        const column = fieldMap[changeRequest.requestedField];
        if (column && changeRequest.requestedValue) {
          bookingUpdate[column] = changeRequest.requestedValue;
        }
      }

      // Update booking
      await tx.booking.update({
        where: { id: changeRequest.bookingId },
        data: bookingUpdate,
      });

      // Approve change request
      const approvedCR = await tx.changeRequest.update({
        where: { id: params.id },
        data: { status: 'APPROVED', adminResponse: adminResponse || 'Approved' },
      });

      // Notify user
      await tx.notification.create({
        data: {
          userId: changeRequest.userId,
          title: 'Change request approved',
          message: `Your change request has been approved.${adminResponse ? ` Note: ${adminResponse}` : ''}`,
          link: `/dashboard/user`,
        },
      });

      return approvedCR;
    });

    await createAuditLog({
      entityType: 'change_request',
      entityId: params.id,
      action: 'approved',
      actorId: user.id,
      newValue: { adminResponse },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message === 'NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Change request not found' } },
        { status: 404 }
      );
    }
    if (message === 'ALREADY_PROCESSED') {
      return NextResponse.json(
        { success: false, error: { code: 'ALREADY_PROCESSED', message: 'Already processed' } },
        { status: 400 }
      );
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Not in your department' } },
        { status: 403 }
      );
    }

    console.error('Approve change-request error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to approve' } },
      { status: 500 }
    );
  }
}
