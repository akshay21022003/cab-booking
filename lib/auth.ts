import { cookies } from 'next/headers';
import { db } from './db';
import { SessionUser, Role } from './types';
import crypto from 'crypto';

const SESSION_COOKIE_NAME = 'cab_session';

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await db.session.create({
    data: { userId, token, isRevoked: false },
  });
  return token;
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

export async function validateSession(): Promise<SessionUser | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        include: { roles: true },
      },
    },
  });

  if (!session || session.isRevoked) return null;
  if (!session.user.isActive) return null;

  const roles = session.user.roles.map((r) => r.role);

  let highestRole: 'USER' | 'DEPARTMENT_ADMIN' | 'SUPER_ADMIN' = 'USER';
  if (roles.includes(Role.SUPER_ADMIN)) highestRole = 'SUPER_ADMIN';
  else if (roles.includes(Role.DEPARTMENT_ADMIN)) highestRole = 'DEPARTMENT_ADMIN';

  return {
    id: session.user.id,
    employeeId: session.user.employeeId,
    name: session.user.name,
    departmentId: session.user.departmentId,
    roles,
    highestRole,
    cabFacility: session.user.cabFacility as 'PICKUP_ONLY' | 'DROP_ONLY' | 'BOTH',
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.session.update({
    where: { id: sessionId },
    data: { isRevoked: true },
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db.session.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true },
  });
}
