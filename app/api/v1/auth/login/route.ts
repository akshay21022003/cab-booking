import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSession, setSessionCookie } from '@/lib/auth';
import { loginSchema } from '@/lib/schemas';
import { createAuditLog } from '@/lib/audit';
import { Role } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid Employee ID format' },
        },
        { status: 400 }
      );
    }

    const { employeeId } = parsed.data;

    // Find user by employee ID
    const user = await db.user.findUnique({
      where: { employeeId },
      include: { roles: true },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Employee ID not found in system' },
        },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INACTIVE', message: 'Account is deactivated. Contact admin.' },
        },
        { status: 403 }
      );
    }

    // Create session (permanent until revoked)
    const token = await createSession(user.id);
    await setSessionCookie(token);

    // Determine highest role
    const roles = user.roles.map((r) => r.role);
    let highestRole: Role = Role.USER;
    if (roles.includes(Role.SUPER_ADMIN)) highestRole = Role.SUPER_ADMIN;
    else if (roles.includes(Role.DEPARTMENT_ADMIN)) highestRole = Role.DEPARTMENT_ADMIN;

    // Audit log
    await createAuditLog({
      entityType: 'session',
      entityId: user.id,
      action: 'login',
      actorId: user.id,
      newValue: { employeeId },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        employeeId: user.employeeId,
        name: user.name,
        departmentId: user.departmentId,
        roles,
        highestRole,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Login failed. Please try again.' },
      },
      { status: 500 }
    );
  }
}
