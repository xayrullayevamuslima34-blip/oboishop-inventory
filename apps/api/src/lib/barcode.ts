// Minimal EAN-13 generator so every product has a scannable barcode even
// before Phase 7 (proper label/price-tag printing) lands. Uses a "20" +
// timestamp-derived prefix — the 20-29 range is reserved for in-store use,
// which is exactly this case (internally generated, not a real GS1 code).
function ean13CheckDigit(digits12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(digits12[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function generateBarcode(): string {
  const prefix = "20";
  const rest = Math.floor(Math.random() * 10 ** 10)
    .toString()
    .padStart(10, "0");
  const digits12 = prefix + rest;
  return digits12 + String(ean13CheckDigit(digits12));
}
