import { z } from "zod";

export const notificationTypeSchema = z.enum(["LOW_STOCK", "DEBT_THRESHOLD"]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationSchema = z.object({
  id: z.string().uuid(),
  type: notificationTypeSchema,
  title: z.string(),
  message: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  isRead: z.boolean(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;
