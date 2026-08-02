import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { createChangeRequestSchema } from '@/lib/schemas';
import { createAuditLog } from '@/lib/audit';
import { canRequestChange } from '@/lib/utils';

/**
 * POST /api/v1/bookings/:id/change-requests - Create a change request
 * 
 * Rules:
 * - Booking must not be cancelled
 * - Must be more than 24 hours before pickup/drop time
 * - Only 1 active (PENDING) change request per booking at a time
 */
export async function POST(
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

    const booking = await db.booking.findUnique({
      where: { id: params.id },
      include: {
        changeRequests: { where: { status: 'PENDING' } },
      },
    });

    if (!booking) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } },
        { status: 404 }
      );
    }

    if (booking.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Not your booking' } },
        { status: 403 }
      );
    }

    if (booking.isCancelled) {
      return NextResponse.json(
        { success: false, error: { code: 'CANCELLED', message: 'Booking is already cancelled' } },
        { status: 400 }
      );
    }

    // Check 24-hour cutoff using the earliest time on the booking
    const relevantTime = booking.pickupTime || booking.dropTime || '23:59';
    if (!canRequestChange(booking.bookingDate, relevantTime)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'CUTOFF_PASSED', message: 'Changes must be requested at least 24 hours before the booking time' },
        },
        { status: 400 }
      );
    }

    // Only 1 active change request per booking
    if (booking.changeRequests.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'ALREADY_EXISTS', message: 'A pending change request already exists. Edit or delete it first.' },
        },
        { status: 409 }
      );
    }

    const body = await request.json();
    const parsed = createChangeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: parsed.error.flatten().fieldErrors },
        },
        { status: 400 }
      );
    }

    const { requestedField, requestedValue, reason } = parsed.data;

    // If not a cancel action, requestedValue is required
    if (!['CANCEL_BOOKING', 'CANCEL_PICKUP', 'CANCEL_DROP'].includes(requestedField) && !requestedValue) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'New value is required' } },
        { status: 400 }
      );
    }

    // CANCEL_PICKUP only makes sense for BOTH bookings
    if (requestedField === 'CANCEL_PICKUP' && booking.bookingType !== 'BOTH') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Can only cancel pickup from a Both booking' } },
        { status: 400 }
      );
    }

    // CANCEL_DROP only makes sense for BOTH bookings
    if (requestedField === 'CANCEL_DROP' && booking.bookingType !== 'BOTH') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Can only cancel drop from a Both booking' } },
        { status: 400 }
      );
    }

    const changeRequest = await db.changeRequest.create({
      data: {
        bookingId: booking.id,
        userId: user.id,
        requestedField,
        requestedValue: requestedValue || null,
        reason: reason || null,
        status: 'PENDING',
      },
    });

    await createAuditLog({
      entityType: 'change_request',
      entityId: changeRequest.id,
      action: 'created',
      actorId: user.id,
      newValue: { requestedField, requestedValue, reason, bookingId: booking.id },
    });

    return NextResponse.json({ success: true, data: changeRequest }, { status: 201 });
  } catch (error) {
    console.error('POST change-request error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create change request' } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/bookings/:id/change-requests
 */
export async function GET(
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

    const changeRequests = await db.changeRequest.findMany({
      where: { bookingId: params.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: changeRequests });
  } catch (error) {
    console.error('GET change-requests error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch change requests' } },
      { status: 500 }
    );
  }
}
