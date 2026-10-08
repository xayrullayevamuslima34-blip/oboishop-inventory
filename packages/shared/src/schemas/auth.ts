import { z } from "zod";
import { UserRole } from "../enums.js";

export const loginSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(6).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const authUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  fullName: z.string(),
  role: z.nativeEnum(UserRole),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginResponseSchema = z.object({
  token: z.string(),
  user: authUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(128),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(6).max(128),
    newPassword: z.string().min(6).max(128),
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "Yangi parol joriy paroldan farq qilishi kerak",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
