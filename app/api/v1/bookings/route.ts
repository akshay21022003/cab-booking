import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { createBookingSchema } from '@/lib/schemas';
import { createAuditLog } from '@/lib/audit';

/**
 * GET /api/v1/bookings - Get current user's bookings
 * 
 * Default: returns this week + next week bookings (no pagination needed for small set)
 * For older bookings: use ?page=1&older=true to get paginated history
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

    const { searchParams } = new URL(request.url);
    const older = searchParams.get('older') === 'true';

    if (older) {
      // Paginated history of past bookings
      const page = parseInt(searchParams.get('page') || '1');
      const limit = 10;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const where = { userId: user.id, isCancelled: false, bookingDate: { lt: today } };

      const [bookings, total] = await Promise.all([
        db.booking.findMany({
          where,
          orderBy: { bookingDate: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: { changeRequests: { where: { status: 'PENDING' }, take: 1 } },
        }),
        db.booking.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        data: bookings,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    }

    // Default: this week + next week (today to 14 days from now)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const twoWeeksLater = new Date(today);
    twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);

    const bookings = await db.booking.findMany({
      where: {
        userId: user.id,
        isCancelled: false,
        bookingDate: { gte: today, lt: twoWeeksLater },
      },
      orderBy: { bookingDate: 'asc' },
      include: { changeRequests: { where: { status: 'PENDING' }, take: 1 } },
    });

    return NextResponse.json({ success: true, data: bookings });
  } catch (error) {
    console.error('GET bookings error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch bookings' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/bookings - Create a new booking
 * 
 * Respects user's cabFacility:
 * - PICKUP_ONLY: can only book pickup (bookingType must be PICKUP)
 * - DROP_ONLY: can only book drop (bookingType must be DROP)
 * - BOTH: can book PICKUP, DROP, or BOTH
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

    const body = await request.json();
    const parsed = createBookingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid booking data',
            details: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    const { bookingDate, bookingType, pickupLocation, pickupTime, dropLocation, dropTime } = parsed.data;

    // Validate bookingType against user's cab facility
    if (user.cabFacility === 'PICKUP_ONLY' && bookingType !== 'PICKUP') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'You only have pickup facility' } },
        { status: 403 }
      );
    }
    if (user.cabFacility === 'DROP_ONLY' && bookingType !== 'DROP') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'You only have drop facility' } },
        { status: 403 }
      );
    }

    // Validate required fields based on booking type
    if ((bookingType === 'PICKUP' || bookingType === 'BOTH') && (!pickupLocation || !pickupTime)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Pickup location and time are required' } },
        { status: 400 }
      );
    }
    if ((bookingType === 'DROP' || bookingType === 'BOTH') && (!dropLocation || !dropTime)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Drop location and time are required' } },
        { status: 400 }
      );
    }

    // Check booking date is not in the past
    const bookingDateObj = new Date(bookingDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (bookingDateObj < today) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_DATE', message: 'Cannot book for past dates' } },
        { status: 400 }
      );
    }

    // Check for conflicting bookings on the same date
    // Rules:
    // - Only ONE booking per date allowed per user
    // - If you have BOTH, you can't also book PICKUP or DROP separately
    // - If you have PICKUP, you can't book BOTH (which includes pickup)
    // - If you have DROP, you can't book BOTH (which includes drop)
    // - You CAN have separate PICKUP and DROP on the same date (they don't overlap)
    const existingBookings = await db.booking.findMany({
      where: {
        userId: user.id,
        bookingDate: bookingDateObj,
        isCancelled: false,
      },
    });

    if (existingBookings.length > 0) {
      const existingTypes = existingBookings.map((b) => b.bookingType);

      // If trying to book BOTH, no other booking should exist for that date
      if (bookingType === 'BOTH') {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'CONFLICT', message: 'You already have a booking for this date. Cancel it first to book both pickup & drop together.' },
          },
          { status: 409 }
        );
      }

      // If a BOTH booking already exists, can't add anything
      if (existingTypes.includes('BOTH')) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'CONFLICT', message: 'You already have a pickup & drop booking for this date.' },
          },
          { status: 409 }
        );
      }

      // If trying PICKUP and PICKUP already exists
      if (bookingType === 'PICKUP' && existingTypes.includes('PICKUP')) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'DUPLICATE', message: 'You already have a pickup booking for this date.' },
          },
          { status: 409 }
        );
      }

      // If trying DROP and DROP already exists
      if (bookingType === 'DROP' && existingTypes.includes('DROP')) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'DUPLICATE', message: 'You already have a drop booking for this date.' },
          },
          { status: 409 }
        );
      }
    }

    // Get user's cost center
    const userData = await db.user.findUnique({
      where: { id: user.id },
      select: { costCenterId: true },
    });

    // Create booking (confirmed immediately, no approval needed)
    const booking = await db.booking.create({
      data: {
        userId: user.id,
        bookingDate: bookingDateObj,
        bookingType,
        pickupLocation: pickupLocation || null,
        pickupTime: pickupTime || null,
        dropLocation: dropLocation || null,
        dropTime: dropTime || null,
        departmentId: user.departmentId,
        costCenterId: userData?.costCenterId || null,
      },
    });

    await createAuditLog({
      entityType: 'booking',
      entityId: booking.id,
      action: 'created',
      actorId: user.id,
      newValue: { bookingDate, bookingType, pickupLocation, pickupTime, dropLocation, dropTime },
    });

    return NextResponse.json({ success: true, data: booking }, { status: 201 });
  } catch (error) {
    console.error('POST booking error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create booking' } },
      { status: 500 }
    );
  }
}
