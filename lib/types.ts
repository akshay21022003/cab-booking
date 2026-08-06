import { Role, BookingType, CabFacility, ChangeRequestField, ChangeRequestStatus } from '@prisma/client';

export { Role, BookingType, CabFacility, ChangeRequestField, ChangeRequestStatus };

// API Response types
export type ApiResponse<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// Session user (attached to request after auth)
export interface SessionUser {
  id: string;
  email: string;
  departmentId: string;
  roles: Role[];
  highestRole: 'USER' | 'DEPARTMENT_ADMIN' | 'SUPER_ADMIN';
  cabFacility: 'PICKUP_ONLY' | 'DROP_ONLY' | 'BOTH';
}

// Pagination
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}
