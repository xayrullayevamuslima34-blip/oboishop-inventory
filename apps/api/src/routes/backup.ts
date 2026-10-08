import type { FastifyPluginAsync } from "fastify";
import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { env } from "../env.js";
import { writeAuditLog } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { ErrorCode } from "@oboishop/shared";

// Prisma'ning DATABASE_URL'i `?schema=public` kabi Prisma-ga xos query
// parametrlarni o'z ichiga oladi — libpq/pg_dump buni tanimaydi va
// "invalid URI query parameter" xatosi bilan darhol chiqib ketadi. pg_dump
// uchun ulanish satrini shu parametrlardan tozalaymiz (schema tanlanmasa
// pg_dump barcha sxemalarni — bizda faqat "public" — dump qiladi, bu to'liq
// zaxira nusxa uchun aslida yaxshiroq ham).
function toPgDumpUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  return url.toString();
}

// pg_dump'ni ishga tushirib, to'liq chiqishni xotirada yig'amiz (kichik
// do'kon bazasi uchun bir necha MB — streaming murakkabligiga arzimaydi).
// Shu orqali muvaffaqiyatsizlikni (noto'g'ri ulanish, binary topilmasa)
// javob boshlanishidan OLDIN aniqlab, toza JSON xato qaytarish mumkin —
// mijozga "muvaffaqiyatli" deb yarim-buzuq fayl yuborilmaydi.
function runPgDump(databaseUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pgDump = spawn("pg_dump", [toPgDumpUrl(databaseUrl)], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    pgDump.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    pgDump.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    pgDump.on("error", (err) => reject(err));
    pgDump.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `pg_dump kod ${code} bilan tugadi`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

// Moliyaviy tizim uchun zaxira nusxa — to'liq Postgres dump (pg_dump | gzip),
// docs/DEPLOYMENT.md#6da tavsiya qilingan cron buyrug'i bilan bir xil usul,
// faqat mijoz uni terminal ochmasdan tugma orqali qo'lda ham olishi uchun.
// TODO: rollar qo'shilgach (sozlamalar/foydalanuvchilar rejasi), bu marshrutni
// faqat menejer roliga cheklash kerak — hozircha yagona rol bor.
export const backupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.requireRole());

  fastify.get("/download", async (request, reply) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `oboishop-sklad-backup-${stamp}.sql.gz`;

    let dump: Buffer;
    try {
      dump = await runPgDump(env.DATABASE_URL);
    } catch (err) {
      request.log.error({ err }, "pg_dump zaxira nusxa olishda xatolik");
      throw new AppError(ErrorCode.INTERNAL_ERROR, "Zaxira nusxa olishda xatolik yuz berdi", 500);
    }
    const gzipped = gzipSync(dump);

    await writeAuditLog(fastify.prisma, {
      userId: request.user.sub,
      action: "BACKUP_DOWNLOAD",
      entityType: "System",
    });

    reply.header("Content-Type", "application/gzip");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(gzipped);
  });
};
