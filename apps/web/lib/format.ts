const moneyFormatter = new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 });
const qtyFormatter = new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 3 });

// Money/quantity fields come from the API as strings (see
// packages/shared/src/schemas/money.ts — BigInt/Decimal don't survive
// JSON.stringify as numbers). Format for display only; never coerce back to
// a JS number for anything that gets sent back to the API.
export function formatMoney(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${moneyFormatter.format(Number(value))} so'm`;
}

export function formatQuantity(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return qtyFormatter.format(Number(value));
}

// Sana + vaqt — API'dan ISO satr sifatida keladi (masalan mahsulot
// `createdAt`), foydalanuvchiga mahalliy formatda ko'rsatiladi.
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("uz-UZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
