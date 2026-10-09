import path from "node:path";
import fs from "node:fs";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { prismaPlugin } from "./plugins/prisma.js";
import { authPlugin } from "./plugins/auth.js";
import { AppError } from "./lib/errors.js";
import { registerRoutes } from "./routes/index.js";

export async function buildApp() {
  const app = Fastify({
    // Nginx ortida ishlaymiz — haqiqiy mijoz IP'si X-Forwarded-For'da keladi.
    // Faqat localhost'dagi nginx'ga ishonamiz (port 4000 tashqaridan yopiq),
    // aks holda urinish cheklovi hamma uchun bitta hisobga tushib qolardi.
    trustProxy: "127.0.0.1",
    logger: {
      transport:
        process.env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
          : undefined,
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: true });

  // Urinish cheklovi. global: false — butun API bo'ylab emas, faqat aniq
  // marshrutlarda (hozircha /auth/login). Sababi: bitta do'kondagi barcha
  // xodimlar bitta tashqi IP ortida bo'ladi, umumiy cheklov ularni bir-biriga
  // halaqit qilib qo'yardi. Brute-force esa aynan login orqali bo'ladi.
  // Testlarda o'chiq: test to'plami ketma-ket ko'p marta login qiladi va
  // cheklov ularni soxta xatoga olib kelardi (barchasi bitta "IP"dan keladi).
  if (process.env.NODE_ENV !== "test") {
    await app.register(rateLimit, {
      global: false,
      // Vaqt oynasi marshrut darajasida belgilanadi (routes/auth.ts — 15 daqiqa).
      // context.after inglizcha ("15 minutes") qaytargani uchun matn qo'lda yozilgan.
      errorResponseBuilder: () => ({
        statusCode: 429,
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring.",
        },
      }),
    });
  }
  await app.register(prismaPlugin);
  await app.register(authPlugin);

  // Product image uploads — local disk storage (see prisma schema.prisma
  // Product.imageUrl comment: fine for a single-shop deployment, but the
  // uploads/ dir must be included in backups and survive redeploys).
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
  const uploadsDir = path.join(process.cwd(), "uploads");
  fs.mkdirSync(path.join(uploadsDir, "products"), { recursive: true });
  await app.register(fastifyStatic, { root: uploadsDir, prefix: "/uploads/" });

  // Central error handler — maps our domain AppError subclasses and Zod
  // validation errors to the shared ApiErrorBody shape (see
  // packages/shared/src/errors.ts) so every endpoint is consistent instead
  // of leaking stack traces or ad-hoc shapes to the frontend.
  app.setErrorHandler((rawError, request, reply) => {
    const error = rawError as Error & { code?: string };

    // @fastify/rate-limit cheklovga yetganda javobni xato sifatida uzatadi va u
    // shu ishlovchiga tushadi. Ushlamasak — pastdagi "noma'lum xato" tarmog'iga
    // tushib, foydalanuvchiga 429 o'rniga 500 ketadi.
    const limited = rawError as unknown as {
      statusCode?: number;
      error?: { code: string; message: string };
    };
    if (limited.statusCode === 429 && limited.error?.code === "TOO_MANY_REQUESTS") {
      request.log.warn({ ip: request.ip, url: request.url }, "urinish cheklovi");
      return reply.status(429).send({ error: limited.error });
    }

    if (error instanceof AppError) {
      request.log.warn({ err: error }, "domain error");
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Kiritilgan ma'lumotlar noto'g'ri", details: error.flatten() },
      });
    }
    // fastify-type-provider-zod surfaces validation errors with this code
    if (error.code === "FST_ERR_VALIDATION") {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Kiritilgan ma'lumotlar noto'g'ri", details: error.message },
      });
    }
    // Prisma unique-constraint violations (e.g. duplicate SKU/barcode) are a
    // routine client error, not a server failure — map centrally here so
    // every route gets a clean 409 without repeating try/catch per handler.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const fields = (error.meta?.target as string[] | undefined)?.join(", ") ?? "maydon";
      return reply.status(409).send({
        error: { code: "CONFLICT", message: `Bu qiymat allaqachon mavjud (${fields})`, details: error.meta },
      });
    }
    request.log.error({ err: error }, "unhandled error");
    return reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Serverda kutilmagan xatolik yuz berdi" },
    });
  });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(registerRoutes, { prefix: "/api/v1" });

  return app;
}
