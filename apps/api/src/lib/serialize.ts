// Prisma returns `BigInt` for our money columns and `Decimal` (from
// decimal.js, via @prisma/client) for quantity columns. Neither serializes
// through JSON.stringify by default (BigInt throws, Decimal becomes a
// nested object) so every route response is passed through here first.
// Kept deliberately generic/recursive rather than per-DTO so new fields
// never silently break serialization.
// Returns `unknown` on purpose rather than echoing the input type back: the
// whole point of this function is that BigInt/Decimal fields become strings
// at runtime, so preserving the input type would let route handlers return
// something whose *declared* shape (Decimal | null) no longer matches what
// actually goes over the wire (string | null). Callers cast to the shared
// Zod-inferred DTO type (e.g. `as Product`) once they've applied this.
export function toApiJson(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      // Prisma Decimal instances expose toJSON(); duck-type on that instead
      // of importing the Decimal class to avoid a hard dependency here.
      if (v && typeof v === "object" && typeof (v as { toJSON?: unknown }).toJSON === "function" && "s" in v && "e" in v && "d" in v) {
        return (v as { toString(): string }).toString();
      }
      return v;
    }),
  );
}
