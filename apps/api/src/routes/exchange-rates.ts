import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

// O'zbekiston Markaziy bankining ochiq kurs API'si. Brauzerdan to'g'ridan-
// to'g'ri chaqirib bo'lmaydi (CORS), shuning uchun API orqali o'tkazamiz.
const CBU_URL = "https://cbu.uz/uz/arkhiv-kursov-valyut/json/";

// Kurs kuniga bir marta yangilanadi, lekin har bir klaviatura bosilishida
// tashqi so'rov yubormaslik uchun qisqa muddatli kesh qo'yamiz. Kesh muddati
// tugagach keyingi so'rov yangi kursni oladi — ya'ni kurs o'zgarsa, ilova
// ham o'zgargan kursni ko'rsatadi.
const CACHE_TTL_MS = 30 * 60 * 1000;

const rateSchema = z.object({
  code: z.string(),
  /** 1 birlik valyuta necha so'm turishi. */
  rate: z.number(),
  /** Markaziy bank e'lon qilgan sana (YYYY-MM-DD). */
  date: z.string(),
});

export const exchangeRatesResponseSchema = z.object({
  rates: z.array(rateSchema),
  fetchedAt: z.string(),
});

type CachedRates = { payload: z.infer<typeof exchangeRatesResponseSchema>; expiresAt: number };
let cache: CachedRates | null = null;

const WANTED = new Set(["USD", "EUR", "RUB"]);

async function fetchRates(): Promise<z.infer<typeof exchangeRatesResponseSchema>> {
  const res = await fetch(CBU_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`CBU javobi: ${res.status}`);
  const raw = (await res.json()) as { Ccy: string; Rate: string; Date: string }[];

  const rates = raw
    .filter((r) => WANTED.has(r.Ccy))
    .map((r) => ({
      code: r.Ccy,
      rate: Number(r.Rate),
      // CBU sanani "08.09.2026" ko'rinishida beradi — ISO'ga o'giramiz.
      date: r.Date.split(".").reverse().join("-"),
    }))
    .filter((r) => Number.isFinite(r.rate) && r.rate > 0);

  return { rates, fetchedAt: new Date().toISOString() };
}

export const exchangeRateRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", fastify.requireRole());

  app.get("/", { schema: { response: { 200: exchangeRatesResponseSchema } } }, async () => {
    if (cache && cache.expiresAt > Date.now()) return cache.payload;

    try {
      const payload = await fetchRates();
      cache = { payload, expiresAt: Date.now() + CACHE_TTL_MS };
      return payload;
    } catch (err) {
      // Tashqi xizmat ishlamay qolsa, eski keshni bo'lsa ham qaytaramiz —
      // narx kiritish ekrani kurs tufayli ishlamay qolmasligi kerak.
      fastify.log.warn({ err }, "Valyuta kursini olishda xatolik");
      if (cache) return cache.payload;
      return { rates: [], fetchedAt: new Date().toISOString() };
    }
  });
};
