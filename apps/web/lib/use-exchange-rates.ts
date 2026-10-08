"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api-client";

export interface ExchangeRate {
  code: string;
  /** 1 birlik valyuta necha so'm turishi. */
  rate: number;
  date: string;
}

interface ExchangeRatesResponse {
  rates: ExchangeRate[];
  fetchedAt: string;
}

// Kurs Markaziy bankdan olinadi va API tomonda 30 daqiqa keshlanadi.
// Bu yerda esa har 30 daqiqada qayta so'raymiz — kurs o'zgarsa, ilova
// avtomatik yangi kursga o'tadi, hech qayerda qo'lda yozilgan raqam yo'q.
export function useExchangeRates() {
  const query = useQuery({
    queryKey: ["exchange-rates"],
    queryFn: () => apiFetch<ExchangeRatesResponse>("/exchange-rates"),
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const rates = query.data?.rates ?? [];
  const rateDate = rates[0]?.date ?? null;

  /** Valyutadagi summani so'mga o'giradi. UZS uchun o'zi qaytadi. */
  function toUzs(amount: number, currency: string): number | null {
    if (!Number.isFinite(amount)) return null;
    if (currency === "UZS") return amount;
    const found = rates.find((r) => r.code === currency);
    return found ? amount * found.rate : null;
  }

  /** So'mdagi summani tanlangan valyutaga o'giradi. */
  function fromUzs(amountUzs: number, currency: string): number | null {
    if (!Number.isFinite(amountUzs)) return null;
    if (currency === "UZS") return amountUzs;
    const found = rates.find((r) => r.code === currency);
    return found && found.rate > 0 ? amountUzs / found.rate : null;
  }

  function rateOf(currency: string): number | null {
    if (currency === "UZS") return 1;
    return rates.find((r) => r.code === currency)?.rate ?? null;
  }

  return { rates, rateDate, toUzs, fromUzs, rateOf, isLoading: query.isLoading };
}

const uzsFormatter = new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 });
const fxFormatter = new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatUzs(value: number): string {
  return `${uzsFormatter.format(Math.round(value))} so'm`;
}

export function formatFx(value: number, currency: string): string {
  return `${fxFormatter.format(value)} ${currency}`;
}
