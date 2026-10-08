const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  CONFIRMED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-600",
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Qoralama",
  CONFIRMED: "Tasdiqlangan",
  CANCELLED: "Bekor qilingan",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  SALE: "Sotuv",
  CUSTOMER_RETURN: "Mijozdan qaytaruv",
  RETURN_TO_SUPPLIER: "Yetkazib beruvchiga qaytaruv",
  WRITEOFF: "Hisobdan chiqarish",
};

export function DocTypeBadge({ docType }: { docType: string }) {
  return (
    <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
      {DOC_TYPE_LABELS[docType] ?? docType}
    </span>
  );
}
