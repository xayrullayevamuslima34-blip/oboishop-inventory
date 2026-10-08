import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL kerak"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(16, "JWT_SECRET kamida 16 belgi bo'lishi kerak"),
  JWT_EXPIRES_IN: z.string().default("12h"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // In-app bildirishnomalar (qo'ng'iroq belgisi) — kontragent qarzi
  // |balance| shu chegaradan (istalgan yo'nalishda) oshsa bir martalik
  // yozuv yaratiladi. Bo'sh/0 — bu tekshiruv butunlay o'chiq.
  DEBT_ALERT_THRESHOLD: z
    .string()
    .optional()
    .transform((v) => (v ? BigInt(v) : 0n)),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Muhit o'zgaruvchilari noto'g'ri sozlangan:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
