'use server';

import { db } from './db';
import { validateSession, createSession, setSessionCookie, clearSessionCookie, getSessionToken } from './auth';
import { createAuditLog } from './audit';
import { loginSchema, createBookingSchema, createChangeRequestSchema, createUserSchema, updateUserSchema, approveRejectSchema } from './schemas';
import { Role } from '@prisma/client';
import { canRequestChange } from './utils';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

// ============================================================
// AUTH ACTIONS
// ============================================================

export async function loginAction(formData: { email: string }) {
  const parsed = loginSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid email format' } };
  }

  const { email } = parsed.data;

  const user = await db.user.findUnique({
    where: { email },
    include: { roles: true },
  });

  if (!user) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Email not found in system' } };
  }

  if (!user.isActive) {
    return { success: false, error: { code: 'INACTIVE', message: 'Account is deactivated. Contact admin.' } };
  }

  const token = await createSession(user.id);
  await setSessionCookie(token);

  const roles = user.roles.map((r) => r.role);
  let highestRole: Role = Role.USER;
  if (roles.includes(Role.SUPER_ADMIN)) highestRole = Role.SUPER_ADMIN;
  else if (roles.includes(Role.DEPARTMENT_ADMIN)) highestRole = Role.DEPARTMENT_ADMIN;

  await createAuditLog({
    entityType: 'session',
    entityId: user.id,
    action: 'login',
    actorId: user.id,
    newValue: { email },
  });

  return {
    success: true,
    data: { id: user.id, email: user.email, departmentId: user.departmentId, roles, highestRole },
  };
}

export async function logoutAction() {
  const token = await getSessionToken();
  if (token) {
    await db.session.updateMany({ where: { token }, data: { isRevoked: true } });
  }
  await clearSessionCookie();
  redirect('/login');
}

// ============================================================
// BOOKING ACTIONS
// ============================================================

export async function createBookingAction(formData: {
  bookingDate: string;
  bookingType: string;
  pickupLocation?: string | null;
  pickupTime?: string | null;
  dropLocation?: string | null;
  dropTime?: string | null;
}) {
  const user = await validateSession();
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };

  const parsed = createBookingSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid booking data', details: parsed.error.flatten().fieldErrors } };
  }

  const { bookingDate, bookingType, pickupLocation, pickupTime, dropLocation, dropTime } = parsed.data;

  if (user.cabFacility === 'PICKUP_ONLY' && bookingType !== 'PICKUP') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'You only have pickup facility' } };
  }
  if (user.cabFacility === 'DROP_ONLY' && bookingType !== 'DROP') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'You only have drop facility' } };
  }

  if ((bookingType === 'PICKUP' || bookingType === 'BOTH') && (!pickupLocation || !pickupTime)) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Pickup location and time are required' } };
  }
  if ((bookingType === 'DROP' || bookingType === 'BOTH') && (!dropLocation || !dropTime)) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Drop location and time are required' } };
  }

  const bookingDateObj = new Date(bookingDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (bookingDateObj < today) {
    return { success: false, error: { code: 'INVALID_DATE', message: 'Cannot book for past dates' } };
  }

  const existingBookings = await db.booking.findMany({
    where: { userId: user.id, bookingDate: bookingDateObj, isCancelled: false },
  });

  if (existingBookings.length > 0) {
    const existingTypes = existingBookings.map((b) => b.bookingType);
    if (bookingType === 'BOTH') {
      return { success: false, error: { code: 'CONFLICT', message: 'You already have a booking for this date.' } };
    }
    if (existingTypes.includes('BOTH')) {
      return { success: false, error: { code: 'CONFLICT', message: 'You already have a pickup & drop booking for this date.' } };
    }
    if (bookingType === 'PICKUP' && existingTypes.includes('PICKUP')) {
      return { success: false, error: { code: 'DUPLICATE', message: 'You already have a pickup booking for this date.' } };
    }
    if (bookingType === 'DROP' && existingTypes.includes('DROP')) {
      return { success: false, error: { code: 'DUPLICATE', message: 'You already have a drop booking for this date.' } };
    }
  }

  const userData = await db.user.findUnique({ where: { id: user.id }, select: { costCenterId: true } });

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
    entityType: 'booking', entityId: booking.id, action: 'created',
    actorId: user.id, newValue: { bookingDate, bookingType, pickupLocation, pickupTime, dropLocation, dropTime },
  });

  revalidatePath('/dashboard/user');
  return { success: true, data: booking };
}

export async function createChangeRequestAction(bookingId: string, formData: {
  requestedField: string;
  requestedValue?: string | null;
  reason?: string;
}) {
  const user = await validateSession();
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { changeRequests: { where: { status: 'PENDING' } } },
  });

  if (!booking) return { success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } };
  if (booking.userId !== user.id) return { success: false, error: { code: 'FORBIDDEN', message: 'Not your booking' } };
  if (booking.isCancelled) return { success: false, error: { code: 'CANCELLED', message: 'Booking is already cancelled' } };

  const relevantTime = booking.pickupTime || booking.dropTime || '23:59';
  if (!canRequestChange(booking.bookingDate, relevantTime)) {
    return { success: false, error: { code: 'CUTOFF_PASSED', message: 'Changes must be requested at least 24 hours before the booking time' } };
  }

  if (booking.changeRequests.length > 0) {
    return { success: false, error: { code: 'ALREADY_EXISTS', message: 'A pending change request already exists.' } };
  }

  const parsed = createChangeRequestSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: parsed.error.flatten().fieldErrors } };
  }

  const { requestedField, requestedValue, reason } = parsed.data;

  if (!['CANCEL_BOOKING', 'CANCEL_PICKUP', 'CANCEL_DROP'].includes(requestedField) && !requestedValue) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'New value is required' } };
  }
  if (requestedField === 'CANCEL_PICKUP' && booking.bookingType !== 'BOTH') {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Can only cancel pickup from a Both booking' } };
  }
  if (requestedField === 'CANCEL_DROP' && booking.bookingType !== 'BOTH') {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Can only cancel drop from a Both booking' } };
  }

  const changeRequest = await db.changeRequest.create({
    data: {
      bookingId: booking.id, userId: user.id, requestedField, requestedValue: requestedValue || null, reason: reason || null, status: 'PENDING',
    },
  });

  await createAuditLog({
    entityType: 'change_request', entityId: changeRequest.id, action: 'created',
    actorId: user.id, newValue: { requestedField, requestedValue, reason, bookingId: booking.id },
  });

  revalidatePath('/dashboard/user');
  return { success: true, data: changeRequest };
}

// ============================================================
// USER: MY CHANGE REQUESTS
// ============================================================

export async function getMyChangeRequests(page = 1) {
  const user = await validateSession();
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };

  const limit = 15;
  const where = { userId: user.id };

  const [changeRequests, total] = await Promise.all([
    db.changeRequest.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      include: {
        booking: {
          select: { id: true, bookingDate: true, bookingType: true, pickupLocation: true, pickupTime: true, dropLocation: true, dropTime: true },
        },
      },
    }),
    db.changeRequest.count({ where }),
  ]);

  return { success: true, data: changeRequests, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function deleteChangeRequestAction(id: string) {
  const user = await validateSession();
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };

  const changeRequest = await db.changeRequest.findUnique({ where: { id } });
  if (!changeRequest) return { success: false, error: { code: 'NOT_FOUND', message: 'Change request not found' } };
  if (changeRequest.userId !== user.id) return { success: false, error: { code: 'FORBIDDEN', message: 'Not your change request' } };
  if (changeRequest.status !== 'PENDING') return { success: false, error: { code: 'ALREADY_PROCESSED', message: 'Only pending requests can be deleted' } };

  await db.changeRequest.delete({ where: { id } });

  await createAuditLog({
    entityType: 'change_request', entityId: id, action: 'deleted',
    actorId: user.id, newValue: { requestedField: changeRequest.requestedField, bookingId: changeRequest.bookingId },
  });

  revalidatePath('/dashboard/user');
  revalidatePath('/dashboard/user/change-requests');
  return { success: true };
}

// ============================================================
// ADMIN ACTIONS
// ============================================================

export async function approveChangeRequestAction(id: string, adminResponse?: string) {
  const user = await validateSession();
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };
  if (user.highestRole !== 'DEPARTMENT_ADMIN' && user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } };
  }

  const result = await db.$transaction(async (tx) => {
    const changeRequest = await tx.changeRequest.findUnique({
      where: { id }, include: { booking: true },
    });
    if (!changeRequest) throw new Error('NOT_FOUND');
    if (changeRequest.status !== 'PENDING') throw new Error('ALREADY_PROCESSED');
    if (user.highestRole === 'DEPARTMENT_ADMIN' && changeRequest.booking.departmentId !== user.departmentId) {
      throw new Error('FORBIDDEN');
    }

    const bookingUpdate: Record<string, unknown> = {};
    if (changeRequest.requestedField === 'CANCEL_BOOKING') {
      bookingUpdate.isCancelled = true;
    } else if (changeRequest.requestedField === 'CANCEL_PICKUP') {
      bookingUpdate.bookingType = 'DROP';
      bookingUpdate.pickupLocation = null;
      bookingUpdate.pickupTime = null;
    } else if (changeRequest.requestedField === 'CANCEL_DROP') {
      bookingUpdate.bookingType = 'PICKUP';
      bookingUpdate.dropLocation = null;
      bookingUpdate.dropTime = null;
    } else {
      const fieldMap: Record<string, string> = {
        PICKUP_LOCATION: 'pickupLocation', DROP_LOCATION: 'dropLocation',
        PICKUP_TIME: 'pickupTime', DROP_TIME: 'dropTime',
      };
      const column = fieldMap[changeRequest.requestedField];
      if (column && changeRequest.requestedValue) bookingUpdate[column] = changeRequest.requestedValue;
    }

    await tx.booking.update({ where: { id: changeRequest.bookingId }, data: bookingUpdate });
    const approvedCR = await tx.changeRequest.update({
      where: { id }, data: { status: 'APPROVED', adminResponse: adminResponse || 'Approved' },
    });
    await tx.notification.create({
      data: {
        userId: changeRequest.userId, title: 'Change request approved',
        message: `Your change request has been approved.${adminResponse ? ` Note: ${adminResponse}` : ''}`,
        link: `/dashboard/user`,
      },
    });
    return approvedCR;
  });

  await createAuditLog({ entityType: 'change_request', entityId: id, action: 'approved', actorId: user.id, newValue: { adminResponse } });

  revalidatePath('/dashboard/admin/change-requests');
  revalidatePath('/dashboard/admin/bookings');
  return { success: true, data: result };
}

export async function rejectChangeRequestAction(id: string, adminResponse?: string) {
  const user = await validateSession();
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };
  if (user.highestRole !== 'DEPARTMENT_ADMIN' && user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } };
  }

  const changeRequest = await db.changeRequest.findUnique({ where: { id }, include: { booking: true } });
  if (!changeRequest) return { success: false, error: { code: 'NOT_FOUND', message: 'Change request not found' } };
  if (changeRequest.status !== 'PENDING') return { success: false, error: { code: 'ALREADY_PROCESSED', message: 'Already processed' } };
  if (user.highestRole === 'DEPARTMENT_ADMIN' && changeRequest.booking.departmentId !== user.departmentId) {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Not in your department' } };
  }

  const rejected = await db.changeRequest.update({ where: { id }, data: { status: 'REJECTED', adminResponse: adminResponse || 'Rejected' } });
  await db.notification.create({
    data: {
      userId: changeRequest.userId, title: 'Change request rejected',
      message: `Your change request was rejected.${adminResponse ? ` Reason: ${adminResponse}` : ''}`,
      link: `/dashboard/user`,
    },
  });
  await createAuditLog({ entityType: 'change_request', entityId: id, action: 'rejected', actorId: user.id, newValue: { adminResponse } });

  revalidatePath('/dashboard/admin/change-requests');
  return { success: true, data: rejected };
}

export async function createUserAction(formData: Record<string, string>) {
  const user = await validateSession();
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };
  if (user.highestRole !== 'DEPARTMENT_ADMIN' && user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } };
  }

  const parsed = createUserSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: parsed.error.flatten().fieldErrors } };
  }

  const { email, costCenterId, cabFacility, defaultPickupLocation, defaultPickupTime, defaultDropLocation, defaultDropTime } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { success: false, error: { code: 'DUPLICATE', message: 'Email already exists' } };
  }

  const newUser = await db.user.create({
    data: {
      email,
      departmentId: user.departmentId,
      costCenterId: costCenterId || null,
      cabFacility: cabFacility || 'BOTH',
      defaultPickupLocation: defaultPickupLocation || null,
      defaultPickupTime: defaultPickupTime || null,
      defaultDropLocation: defaultDropLocation || null,
      defaultDropTime: defaultDropTime || null,
    },
  });

  await db.userRole.create({ data: { userId: newUser.id, role: Role.USER, departmentId: user.departmentId } });
  await createAuditLog({ entityType: 'user', entityId: newUser.id, action: 'created', actorId: user.id, newValue: { email, cabFacility } });

  revalidatePath('/dashboard/admin/users');
  return { success: true, data: newUser };
}

export async function updateUserAction(id: string, formData: Record<string, string>) {
  const user = await validateSession();
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };
  if (user.highestRole !== 'DEPARTMENT_ADMIN' && user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } };
  }

  const targetUser = await db.user.findUnique({ where: { id } });
  if (!targetUser) return { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
  if (user.highestRole === 'DEPARTMENT_ADMIN' && targetUser.departmentId !== user.departmentId) {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Not in your department' } };
  }

  const parsed = updateUserSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: parsed.error.flatten().fieldErrors } };
  }

  const { email, costCenterId, cabFacility, defaultPickupLocation, defaultPickupTime, defaultDropLocation, defaultDropTime } = parsed.data;

  const updateData: Record<string, unknown> = {};
  if (email !== undefined) updateData.email = email;
  if (costCenterId !== undefined) updateData.costCenterId = costCenterId || null;
  if (cabFacility !== undefined) updateData.cabFacility = cabFacility;
  if (defaultPickupLocation !== undefined) updateData.defaultPickupLocation = defaultPickupLocation || null;
  if (defaultPickupTime !== undefined) updateData.defaultPickupTime = defaultPickupTime || null;
  if (defaultDropLocation !== undefined) updateData.defaultDropLocation = defaultDropLocation || null;
  if (defaultDropTime !== undefined) updateData.defaultDropTime = defaultDropTime || null;

  const updated = await db.user.update({ where: { id }, data: updateData });
  await createAuditLog({
    entityType: 'user', entityId: id, action: 'updated', actorId: user.id,
    oldValue: { email: targetUser.email, cabFacility: targetUser.cabFacility }, newValue: updateData,
  });

  revalidatePath('/dashboard/admin/users');
  return { success: true, data: updated };
}

export async function assignDepartmentAdminAction(departmentId: string, email: string) {
  const user = await validateSession();
  if (!user || user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } };
  }

  const targetUser = await db.user.findUnique({ where: { email } });
  if (!targetUser) return { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } };

  await db.userRole.upsert({
    where: { userId_role_departmentId: { userId: targetUser.id, role: Role.DEPARTMENT_ADMIN, departmentId } },
    update: {},
    create: { userId: targetUser.id, role: Role.DEPARTMENT_ADMIN, departmentId },
  });
  await db.departmentAdmin.upsert({
    where: { departmentId_userId: { departmentId, userId: targetUser.id } },
    update: {},
    create: { departmentId, userId: targetUser.id },
  });

  await createAuditLog({
    entityType: 'department', entityId: departmentId, action: 'admin_assigned',
    actorId: user.id, newValue: { email, userId: targetUser.id },
  });

  revalidatePath('/dashboard/super-admin/departments');
  return { success: true, data: { message: `${email} assigned as admin` } };
}

export async function removeDepartmentAdminAction(departmentId: string, userId: string) {
  const user = await validateSession();
  if (!user || user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } };
  }

  await db.departmentAdmin.deleteMany({ where: { departmentId, userId } });
  await db.userRole.deleteMany({ where: { userId, role: Role.DEPARTMENT_ADMIN, departmentId } });

  await createAuditLog({
    entityType: 'department', entityId: departmentId, action: 'admin_removed',
    actorId: user.id, newValue: { removedUserId: userId },
  });

  revalidatePath('/dashboard/super-admin/departments');
  return { success: true, data: { message: 'Admin removed' } };
}

export async function createDepartmentAction(name: string) {
  const user = await validateSession();
  if (!user || user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } };
  }

  const existing = await db.department.findUnique({ where: { name } });
  if (existing) return { success: false, error: { code: 'DUPLICATE', message: 'Department name already exists' } };

  const dept = await db.department.create({ data: { name } });
  await createAuditLog({ entityType: 'department', entityId: dept.id, action: 'created', actorId: user.id, newValue: { name } });

  revalidatePath('/dashboard/super-admin/departments');
  return { success: true, data: dept };
}

export async function updateDepartmentAction(id: string, data: { name?: string; isActive?: boolean }) {
  const user = await validateSession();
  if (!user || user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } };
  }

  const dept = await db.department.findUnique({ where: { id } });
  if (!dept) return { success: false, error: { code: 'NOT_FOUND', message: 'Department not found' } };

  const updated = await db.department.update({ where: { id }, data });
  await createAuditLog({
    entityType: 'department', entityId: id, action: 'updated', actorId: user.id,
    oldValue: { name: dept.name, isActive: dept.isActive }, newValue: data,
  });

  revalidatePath('/dashboard/super-admin/departments');
  return { success: true, data: updated };
}

export async function createCostCenterAction(data: { name: string; code: string; departmentId: string }) {
  const user = await validateSession();
  if (!user || user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } };
  }

  const existing = await db.costCenter.findUnique({ where: { code: data.code } });
  if (existing) return { success: false, error: { code: 'DUPLICATE', message: 'Cost center code already exists' } };

  const cc = await db.costCenter.create({ data });
  await createAuditLog({ entityType: 'cost_center', entityId: cc.id, action: 'created', actorId: user.id, newValue: data });

  revalidatePath('/dashboard/super-admin/cost-centers');
  return { success: true, data: cc };
}

export async function updateCostCenterAction(id: string, data: { name?: string; isActive?: boolean }) {
  const user = await validateSession();
  if (!user || user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } };
  }

  const updated = await db.costCenter.update({ where: { id }, data });
  revalidatePath('/dashboard/super-admin/cost-centers');
  return { success: true, data: updated };
}

export async function revokeSessionAction(sessionId: string) {
  const user = await validateSession();
  if (!user || user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } };
  }

  await db.session.update({ where: { id: sessionId }, data: { isRevoked: true } });
  await createAuditLog({ entityType: 'session', entityId: sessionId, action: 'revoked', actorId: user.id, newValue: { sessionId } });

  revalidatePath('/dashboard/super-admin/sessions');
  return { success: true, data: { message: 'Session revoked' } };
}

export async function revokeAllUserSessionsAction(userId: string) {
  const user = await validateSession();
  if (!user || user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } };
  }

  const result = await db.session.updateMany({ where: { userId, isRevoked: false }, data: { isRevoked: true } });
  await createAuditLog({ entityType: 'session', entityId: userId, action: 'all_revoked', actorId: user.id, newValue: { userId, count: result.count } });

  revalidatePath('/dashboard/super-admin/sessions');
  return { success: true, data: { message: `${result.count} session(s) revoked` } };
}


// ============================================================
// DATA FETCHING ACTIONS (replacing GET API routes)
// ============================================================

export async function getMyBookings(older = false, page = 1) {
  const user = await validateSession();
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };

  if (older) {
    const limit = 10;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const where = { userId: user.id, isCancelled: false, bookingDate: { lt: today } };

    const [bookings, total] = await Promise.all([
      db.booking.findMany({
        where, orderBy: { bookingDate: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: { changeRequests: { where: { status: 'PENDING' }, take: 1 } },
      }),
      db.booking.count({ where }),
    ]);

    return { success: true, data: bookings, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twoWeeksLater = new Date(today);
  twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);

  const bookings = await db.booking.findMany({
    where: { userId: user.id, isCancelled: false, bookingDate: { gte: today, lt: twoWeeksLater } },
    orderBy: { bookingDate: 'asc' },
    include: { changeRequests: { where: { status: 'PENDING' }, take: 1 } },
  });

  return { success: true, data: bookings };
}

export async function getMyProfile() {
  const user = await validateSession();
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };

  const profile = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true, email: true, departmentId: true, costCenterId: true, cabFacility: true,
      defaultPickupLocation: true, defaultPickupTime: true, defaultDropLocation: true, defaultDropTime: true,
      department: { select: { name: true } },
      costCenter: { select: { name: true, code: true } },
    },
  });

  return { success: true, data: { ...profile, roles: user.roles, highestRole: user.highestRole } };
}

export async function getAdminBookings(params: { page?: number; startDate?: string; endDate?: string; departmentId?: string; showCancelled?: boolean }) {
  const user = await validateSession();
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };
  if (user.highestRole !== 'DEPARTMENT_ADMIN' && user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } };
  }

  const page = params.page || 1;
  const limit = 20;
  const where: Record<string, unknown> = {};

  if (user.highestRole === 'DEPARTMENT_ADMIN') {
    where.departmentId = user.departmentId;
  } else if (params.departmentId) {
    where.departmentId = params.departmentId;
  }

  if (!params.showCancelled) where.isCancelled = false;

  if (params.startDate || params.endDate) {
    where.bookingDate = {};
    if (params.startDate) (where.bookingDate as Record<string, unknown>).gte = new Date(params.startDate);
    if (params.endDate) (where.bookingDate as Record<string, unknown>).lte = new Date(params.endDate);
  }

  const [bookings, total] = await Promise.all([
    db.booking.findMany({
      where, orderBy: { bookingDate: 'desc' }, skip: (page - 1) * limit, take: limit,
      include: {
        user: { select: { email: true, cabFacility: true } },
        costCenter: { select: { name: true, code: true } },
        changeRequests: { where: { status: 'PENDING' }, take: 1 },
      },
    }),
    db.booking.count({ where }),
  ]);

  return { success: true, data: bookings, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getAdminChangeRequests(params: { page?: number; status?: string; departmentId?: string }) {
  const user = await validateSession();
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };
  if (user.highestRole !== 'DEPARTMENT_ADMIN' && user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } };
  }

  const page = params.page || 1;
  const limit = 15;
  const status = params.status || 'PENDING';
  const where: Record<string, unknown> = { status };

  if (user.highestRole === 'DEPARTMENT_ADMIN') {
    where.booking = { departmentId: user.departmentId };
  } else if (params.departmentId) {
    where.booking = { departmentId: params.departmentId };
  }

  const [changeRequests, total] = await Promise.all([
    db.changeRequest.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      include: {
        booking: {
          select: { id: true, bookingDate: true, bookingType: true, pickupLocation: true, pickupTime: true, dropLocation: true, dropTime: true, departmentId: true },
        },
        user: { select: { email: true } },
      },
    }),
    db.changeRequest.count({ where }),
  ]);

  return { success: true, data: changeRequests, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getAdminUsers(params: { page?: number; departmentId?: string }) {
  const user = await validateSession();
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };
  if (user.highestRole !== 'DEPARTMENT_ADMIN' && user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } };
  }

  const page = params.page || 1;
  const limit = 15;
  const where: Record<string, unknown> = {};

  if (user.highestRole === 'DEPARTMENT_ADMIN') {
    where.departmentId = user.departmentId;
  } else if (params.departmentId) {
    where.departmentId = params.departmentId;
  }

  const [users, total] = await Promise.all([
    db.user.findMany({
      where, orderBy: { email: 'asc' }, skip: (page - 1) * limit, take: limit,
      select: {
        id: true, email: true, isActive: true, cabFacility: true, costCenterId: true,
        defaultPickupLocation: true, defaultPickupTime: true, defaultDropLocation: true, defaultDropTime: true,
        costCenter: { select: { id: true, name: true, code: true } },
        roles: { select: { role: true } },
      },
    }),
    db.user.count({ where }),
  ]);

  return { success: true, data: users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getAdminDepartments() {
  const user = await validateSession();
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };
  if (user.highestRole !== 'DEPARTMENT_ADMIN' && user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } };
  }

  if (user.highestRole === 'SUPER_ADMIN') {
    const departments = await db.department.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
    return { success: true, data: departments, isSuperAdmin: true };
  }

  const dept = await db.department.findUnique({ where: { id: user.departmentId }, select: { id: true, name: true } });
  return { success: true, data: dept ? [dept] : [], isSuperAdmin: false };
}

export async function getAdminCostCenters() {
  const user = await validateSession();
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };
  if (user.highestRole !== 'DEPARTMENT_ADMIN' && user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } };
  }

  const where: Record<string, unknown> = { isActive: true };
  if (user.highestRole === 'DEPARTMENT_ADMIN') {
    where.departmentId = user.departmentId;
  }

  const costCenters = await db.costCenter.findMany({
    where, orderBy: { code: 'asc' },
    select: { id: true, name: true, code: true, departmentId: true },
  });

  return { success: true, data: costCenters };
}

export async function getSuperAdminDepartments() {
  const user = await validateSession();
  if (!user || user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } };
  }

  const departments = await db.department.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { users: true, costCenters: true } },
      departmentAdmins: { include: { user: { select: { email: true } } } },
    },
  });

  return { success: true, data: departments };
}

export async function getSuperAdminCostCenters(departmentId?: string) {
  const user = await validateSession();
  if (!user || user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } };
  }

  const where: Record<string, unknown> = {};
  if (departmentId) where.departmentId = departmentId;

  const costCenters = await db.costCenter.findMany({
    where, orderBy: { code: 'asc' },
    include: { department: { select: { name: true } }, _count: { select: { users: true } } },
  });

  return { success: true, data: costCenters };
}

export async function getSuperAdminSessions() {
  const user = await validateSession();
  if (!user || user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } };
  }

  const sessions = await db.session.findMany({
    where: { isRevoked: false }, orderBy: { createdAt: 'desc' },
    include: { user: { select: { email: true, departmentId: true } } },
  });

  return { success: true, data: sessions };
}

export async function searchUsers(query: string) {
  const user = await validateSession();
  if (!user || user.highestRole !== 'SUPER_ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } };
  }

  if (query.length < 2) return { success: true, data: [] };

  const users = await db.user.findMany({
    where: { isActive: true, email: { contains: query, mode: 'insensitive' } },
    select: { id: true, email: true, department: { select: { name: true } } },
    orderBy: { email: 'asc' }, take: 10,
  });

  return { success: true, data: users };
}
