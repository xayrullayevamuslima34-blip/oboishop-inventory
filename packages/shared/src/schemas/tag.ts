import { z } from "zod";

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(60),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const tagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string(),
});
export type Tag = z.infer<typeof tagSchema>;
