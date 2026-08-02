import { db } from './db';

interface AuditParams {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}

/**
 * Create an audit log entry for any tracked action.
 */
export async function createAuditLog(params: AuditParams): Promise<void> {
  await db.auditLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      actorId: params.actorId,
      oldValue: params.oldValue ? JSON.stringify(params.oldValue) : null,
      newValue: params.newValue ? JSON.stringify(params.newValue) : null,
    },
  });
}
