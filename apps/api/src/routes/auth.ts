import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import bcrypt from "bcryptjs";
import { authUserSchema, changePasswordSchema, loginResponseSchema, loginSchema, updateProfileSchema } from "@oboishop/shared";
import { UnauthorizedError } from "../lib/errors.js";
import { writeAuditLog } from "../lib/audit.js";
import type { JwtPayload } from "../plugins/auth.js";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    "/login",
    { schema: { body: loginSchema, response: { 200: loginResponseSchema } } },
    async (request) => {
      const { username, password } = request.body;

      const user = await fastify.prisma.user.findUnique({ where: { username } });
      if (!user || !user.isActive) {
        throw new UnauthorizedError("Login yoki parol noto'g'ri");
      }

      const passwordOk = await bcrypt.compare(password, user.passwordHash);
      if (!passwordOk) {
        throw new UnauthorizedError("Login yoki parol noto'g'ri");
      }

      const payload: JwtPayload = { sub: user.id, username: user.username, role: user.role };
      const token = fastify.jwt.sign(payload);

      return {
        token,
        user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
      };
    },
  );

  app.get(
    "/me",
    { preHandler: fastify.authenticate, schema: { response: { 200: authUserSchema } } },
    async (request) => {
      const user = await fastify.prisma.user.findUnique({ where: { id: request.user.sub } });
      if (!user) throw new UnauthorizedError();
      return { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
    },
  );

  app.patch(
    "/me",
    { preHandler: fastify.authenticate, schema: { body: updateProfileSchema, response: { 200: authUserSchema } } },
    async (request) => {
      const before = await fastify.prisma.user.findUnique({ where: { id: request.user.sub } });
      if (!before) throw new UnauthorizedError();

      const user = await fastify.prisma.user.update({
        where: { id: request.user.sub },
        data: { fullName: request.body.fullName },
      });
      await writeAuditLog(fastify.prisma, {
        userId: request.user.sub,
        action: "user.update_profile",
        entityType: "User",
        entityId: user.id,
        beforeData: { fullName: before.fullName },
        afterData: { fullName: user.fullName },
      });
      return { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
    },
  );

  app.post(
    "/change-password",
    { preHandler: fastify.authenticate, schema: { body: changePasswordSchema, response: { 200: authUserSchema } } },
    async (request) => {
      const user = await fastify.prisma.user.findUnique({ where: { id: request.user.sub } });
      if (!user) throw new UnauthorizedError();

      const currentOk = await bcrypt.compare(request.body.currentPassword, user.passwordHash);
      if (!currentOk) throw new UnauthorizedError("Joriy parol noto'g'ri");

      const passwordHash = await bcrypt.hash(request.body.newPassword, 10);
      await fastify.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
      // Parolning o'zi hech qachon audit_log'ga yozilmaydi — faqat harakatning o'zi.
      await writeAuditLog(fastify.prisma, {
        userId: user.id,
        action: "user.change_password",
        entityType: "User",
        entityId: user.id,
      });
      return { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
    },
  );
};
