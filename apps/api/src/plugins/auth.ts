import fastifyJwt from "@fastify/jwt";
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { UserRole } from "@oboishop/shared";
import { env } from "../env.js";
import { UnauthorizedError } from "../lib/errors.js";

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    // Route-level preHandler: verifies the bearer JWT, attaches request.user.
    // Every role check today is a no-op (single role, SKLAD_MENEJERI) but
    // routes should still call requireRole(...) rather than skip it, so
    // adding a second role later (see plan Phase 8 open question) is a
    // one-line change per route, not a rewrite.
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const authPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  fastify.decorate("authenticate", async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError("Token yaroqsiz yoki muddati o'tgan");
    }
  });

  fastify.decorate("requireRole", (...roles: UserRole[]) => {
    return async (request: FastifyRequest) => {
      try {
        await request.jwtVerify();
      } catch {
        throw new UnauthorizedError("Token yaroqsiz yoki muddati o'tgan");
      }
      if (roles.length > 0 && !roles.includes(request.user.role)) {
        throw new UnauthorizedError("Bu amal uchun ruxsatingiz yo'q");
      }
    };
  });
});
