"use client";

import { formatFx, formatUzs, useExchangeRates } from "@/lib/use-exchange-rates";

// Narx maydoni ostidagi jonli kurs izohi: dollarda yozilsa so'mdagi qiymati,
// so'mda yozilsa dollardagi qiymati ko'rsatiladi. Kurs Markaziy bankdan
// real vaqtda olinadi — kodda qotirilgan raqam yo'q.
export function CurrencyHint({ amount, currency }: { amount: string | number | null | undefined; currency: string }) {
  const { toUzs, fromUzs, rateOf, rateDate, isLoading } = useExchangeRates();

  const value = typeof amount === "string" ? Number(amount) : amount;
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return null;

  if (isLoading) return <p className="mt-1 text-xs text-slate-400">Kurs yuklanmoqda...</p>;

  const rate = rateOf(currency);
  if (rate === null) return <p className="mt-1 text-xs text-slate-400">Kurs mavjud emas</p>;

  // So'mda kiritilsa dollarga, valyutada kiritilsa so'mga o'giramiz.
  const converted =
    currency === "UZS" ? fromUzs(value, "USD") : toUzs(value, currency);
  if (converted === null) return null;

  const text = currency === "UZS" ? formatFx(converted, "USD") : formatUzs(converted);
  const rateText = currency === "UZS" ? rateOf("USD") : rate;

  return (
    <p className="mt-1 text-xs text-slate-500">
      ≈ <span className="font-medium text-slate-700">{text}</span>
      {rateText !== null && (
        <span className="ml-1 text-slate-400">
          (1 {currency === "UZS" ? "USD" : currency} = {formatUzs(rateText)}
          {rateDate ? `, ${rateDate}` : ""})
        </span>
      )}
    </p>
  );
}
