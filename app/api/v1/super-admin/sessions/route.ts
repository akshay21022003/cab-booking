import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';

/**
 * GET /api/v1/super-admin/sessions - List all active sessions
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

    const sessions = await db.session.findMany({
      where: { isRevoked: false },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, employeeId: true, departmentId: true } },
      },
    });

    return NextResponse.json({ success: true, data: sessions });
  } catch (error) {
    console.error('GET sessions error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch' } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/super-admin/sessions?id=xxx - Revoke a session
 * DELETE /api/v1/super-admin/sessions?userId=xxx - Revoke all sessions for a user
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await validateSession();
    if (!user || user.highestRole !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Super Admin only' } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('id');
    const userId = searchParams.get('userId');

    if (sessionId) {
      await db.session.update({ where: { id: sessionId }, data: { isRevoked: true } });
      await createAuditLog({
        entityType: 'session', entityId: sessionId, action: 'revoked',
        actorId: user.id, newValue: { sessionId },
      });
      return NextResponse.json({ success: true, data: { message: 'Session revoked' } });
    }

    if (userId) {
      const result = await db.session.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      });
      await createAuditLog({
        entityType: 'session', entityId: userId, action: 'all_revoked',
        actorId: user.id, newValue: { userId, count: result.count },
      });
      return NextResponse.json({ success: true, data: { message: `${result.count} session(s) revoked` } });
    }

    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide id or userId' } },
      { status: 400 }
    );
  } catch (error) {
    console.error('DELETE session error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to revoke' } },
      { status: 500 }
    );
  }
}
