import { z } from "zod";

export const auditLogEntrySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  userFullName: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  beforeData: z.unknown().nullable(),
  afterData: z.unknown().nullable(),
  createdAt: z.string(),
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
