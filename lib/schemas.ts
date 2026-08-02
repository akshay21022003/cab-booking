import { z } from 'zod';

// ============================================================
// AUTH SCHEMAS
// ============================================================

export const loginSchema = z.object({
  employeeId: z
    .string()
    .min(1, 'Employee ID is required')
    .max(20, 'Employee ID too long')
    .regex(/^[A-Z0-9]+$/, 'Employee ID must be uppercase alphanumeric'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ============================================================
// BOOKING SCHEMAS
// ============================================================

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const createBookingSchema = z.object({
  bookingDate: z.string().refine((val) => {
    const date = new Date(val);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 7);
    return date >= today && date <= maxDate;
  }, 'Booking date must be between today and 7 days from now'),
  bookingType: z.enum(['PICKUP', 'DROP', 'BOTH']),
  pickupLocation: z.string().min(2).max(200).optional().nullable(),
  pickupTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)').optional().nullable(),
  dropLocation: z.string().min(2).max(200).optional().nullable(),
  dropTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)').optional().nullable(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

// ============================================================
// CHANGE REQUEST SCHEMAS
// ============================================================

export const createChangeRequestSchema = z.object({
  requestedField: z.enum([
    'PICKUP_LOCATION',
    'DROP_LOCATION',
    'PICKUP_TIME',
    'DROP_TIME',
    'CANCEL_PICKUP',
    'CANCEL_DROP',
    'CANCEL_BOOKING',
  ]),
  requestedValue: z.string().max(200).optional().nullable(),
  reason: z.string().max(500).optional(),
});

export type CreateChangeRequestInput = z.infer<typeof createChangeRequestSchema>;

export const updateChangeRequestSchema = z.object({
  requestedField: z
    .enum(['PICKUP_LOCATION', 'DROP_LOCATION', 'PICKUP_TIME', 'DROP_TIME', 'CANCEL_PICKUP', 'CANCEL_DROP', 'CANCEL_BOOKING'])
    .optional(),
  requestedValue: z.string().max(200).optional().nullable(),
  reason: z.string().max(500).optional(),
});

export type UpdateChangeRequestInput = z.infer<typeof updateChangeRequestSchema>;

// ============================================================
// ADMIN SCHEMAS
// ============================================================

export const createUserSchema = z.object({
  employeeId: z
    .string()
    .min(1, 'Required')
    .max(20)
    .regex(/^[A-Z0-9]+$/, 'Must be uppercase alphanumeric'),
  name: z.string().min(2, 'Name required').max(100),
  email: z.string().email().optional().or(z.literal('')),
  costCenterId: z.string().optional(),
  cabFacility: z.enum(['PICKUP_ONLY', 'DROP_ONLY', 'BOTH']).optional(),
  defaultPickupLocation: z.string().max(200).optional(),
  defaultPickupTime: z.string().regex(timeRegex, 'Invalid time').optional().or(z.literal('')),
  defaultDropLocation: z.string().max(200).optional(),
  defaultDropTime: z.string().regex(timeRegex, 'Invalid time').optional().or(z.literal('')),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.partial();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const approveRejectSchema = z.object({
  adminResponse: z.string().max(500).optional(),
});

export type ApproveRejectInput = z.infer<typeof approveRejectSchema>;
