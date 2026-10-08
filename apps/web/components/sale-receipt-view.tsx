import { formatMoney, formatQuantity } from "@/lib/format";

export interface ReceiptItem {
  productName: string;
  qty: string;
  salePrice: string | null;
  lineTotal: string | null;
}

// Narrow, thermal-printer-style receipt (58/80mm register tape look) for a
// confirmed SALE — separate from DocumentPrintView because a customer
// receipt and an internal document are different documents in real retail
// use, not just different styling of the same one.
export function SaleReceiptView({
  docNumber,
  documentDate,
  customerName,
  items,
  totalAmount,
  note,
}: {
  docNumber: string;
  documentDate: string;
  customerName: string | null;
  items: ReceiptItem[];
  totalAmount: string | null;
  /** Sotuvchi yozgan tasnif — chekning pastida chiqadi. */
  note?: string | null;
}) {
  return (
    <div className="mx-auto max-w-xs font-mono text-[13px] font-semibold leading-snug text-black">
      <div className="text-center">
        <p className="text-base font-extrabold tracking-wide">OBOISHOP</p>
        <p className="font-semibold text-slate-700">Sotuv cheki</p>
      </div>
      <div className="my-2 border-t border-dashed border-slate-600" />
      <p>№ {docNumber}</p>
      <p>{new Date(documentDate).toLocaleString("uz-UZ")}</p>
      {customerName && <p>Mijoz: {customerName}</p>}
      <div className="my-2 border-t border-dashed border-slate-600" />
      {items.map((item, i) => (
        <div key={i} className="mb-1.5">
          <p className="truncate font-bold">{item.productName}</p>
          <div className="flex justify-between text-slate-800">
            <span>
              {formatQuantity(item.qty)} × {formatMoney(item.salePrice)}
            </span>
            <span>{formatMoney(item.lineTotal)}</span>
          </div>
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-slate-600" />
      <div className="flex justify-between text-base font-extrabold">
        <span>JAMI</span>
        <span>{formatMoney(totalAmount)}</span>
      </div>
      {note && (
        <>
          <div className="my-2 border-t border-dashed border-slate-600" />
          <p className="font-bold">Tasnif:</p>
          <p className="whitespace-pre-wrap break-words">{note}</p>
        </>
      )}
      <div className="my-2 border-t border-dashed border-slate-600" />
      <p className="text-center font-semibold text-slate-700">Xaridingiz uchun rahmat!</p>
    </div>
  );
}
