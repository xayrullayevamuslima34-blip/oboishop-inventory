import type { PrismaClient } from "@prisma/client";

interface WriteAuditLogInput {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
}

// Every create/update/confirm/cancel on a financially-relevant entity should
// call this — see docs/ARCHITECTURE.md. `tx` accepts either the top-level
// PrismaClient or a `$transaction` callback client so audit rows are written
// atomically with the change they describe.
export async function writeAuditLog(
  tx: Pick<PrismaClient, "auditLog">,
  input: WriteAuditLogInput,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeData: input.beforeData === undefined ? undefined : (input.beforeData as object),
      afterData: input.afterData === undefined ? undefined : (input.afterData as object),
    },
  });
}
