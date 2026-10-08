"use client";

import { Fragment, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Contragent, Product, StockOutDocument } from "@oboishop/shared";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { RowActions } from "@/components/ui/row-actions";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { CustomerPicker } from "@/components/customer-picker";
import { ProductPicker } from "@/components/product-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface EditLine {
  productId: string;
  name: string;
  sku: string;
  qty: number;
  salePrice: number;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  SALE: "Sotuv",
  CUSTOMER_RETURN: "Mijozdan qaytaruv",
  RETURN_TO_SUPPLIER: "Yetkazib beruvchiga qaytaruv",
  WRITEOFF: "Hisobdan chiqarish",
};

function PrinterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

const UNIT_LABEL: Record<string, string> = { RULON: "rulon", DONA: "dona", METR: "metr" };

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Qoralama",
  CONFIRMED: "Tasdiqlangan",
  CANCELLED: "Bekor qilingan",
};

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  CONFIRMED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

// Operatsiyalar — kassada va qaytaruvda rasmiylashtirilgan barcha hujjatlar
// bir joyda. Har bir hujjatni ochib mahsulotlarini, kim qachon yaratgani va
// bekor qilgani ko'rinadi; shu yerdan tahrirlash yoki bekor qilish mumkin.
export default function OperationsPage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("");
  // Sana oralig'i — sukut bo'yicha joriy oyning boshidan bugungacha.
  const [from, setFrom] = useState(() => new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [printAfterOpen, setPrintAfterOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDoc, setEditDoc] = useState<StockOutDocument | null>(null);
  const [editCustomerId, setEditCustomerId] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editLines, setEditLines] = useState<EditLine[]>([]);
  const [draftProductId, setDraftProductId] = useState("");
  const [draftQty, setDraftQty] = useState("1");
  const [draftPrice, setDraftPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cancelDoc, setCancelDoc] = useState<StockOutDocument | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<StockOutDocument | null>(null);
  const [viewDoc, setViewDoc] = useState<StockOutDocument | null>(null);

  const docsQuery = useQuery({
    queryKey: ["stock-out", "operations", typeFilter, from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (typeFilter) params.set("docType", typeFilter);
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString());
      const qs = params.toString();
      return apiFetch<StockOutDocument[]>(`/stock-out${qs ? `?${qs}` : ""}`);
    },
  });

  // Mijoz bo'yicha qidiruv ro'yxat ustida ishlaydi — alohida so'rov shart emas.
  const docs = (docsQuery.data ?? []).filter((d) =>
    search.trim() ? (d.contragentName ?? "").toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  // Pastdagi "Umumiy summa" — bekor qilinganlar hisobga olinmaydi.
  const grandTotal = docs
    .filter((d) => d.status !== "CANCELLED")
    .reduce((sum, d) => sum + Number(d.totalAmount ?? 0), 0);

  // Chek oynasi ochilgach darhol chop etish (ro'yxatdagi printer tugmasi).
  useEffect(() => {
    if (viewDoc && printAfterOpen) {
      setPrintAfterOpen(false);
      const timer = window.setTimeout(() => window.print(), 150);
      return () => window.clearTimeout(timer);
    }
  }, [viewDoc, printAfterOpen]);
  const customersQuery = useQuery({
    queryKey: ["contragents", "CUSTOMER"],
    queryFn: () => apiFetch<Contragent[]>("/contragents?type=CUSTOMER"),
  });
  const productsQuery = useQuery({
    queryKey: ["products", "operations"],
    queryFn: () => apiFetch<(Product & { qtyOnHand: string })[]>("/products"),
  });
  const draftProduct = productsQuery.data?.find((p) => p.id === draftProductId) ?? null;
  const editTotal = editLines.reduce((sum, l) => sum + l.qty * l.salePrice, 0);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["stock-out"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["reports"] });
    queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  }

  const updateMutation = useMutation({
    mutationFn: (doc: StockOutDocument) => {
      // Qatorlar o'zgarmagan bo'lsa — yengil PATCH (hujjat raqami saqlanadi).
      const itemsChanged =
        editLines.length !== doc.items.length ||
        editLines.some((l, i) => {
          const orig = doc.items[i];
          return !orig || orig.productId !== l.productId || Number(orig.qty) !== l.qty || Number(orig.salePrice ?? 0) !== l.salePrice;
        });

      if (!itemsChanged) {
        return apiFetch<StockOutDocument>(`/stock-out/${doc.id}`, {
          method: "PATCH",
          body: { contragentId: editCustomerId || null, note: editNote.trim() || null },
        });
      }

      return apiFetch<StockOutDocument>(`/stock-out/${doc.id}/replace`, {
        method: "POST",
        body: {
          contragentId: editCustomerId || null,
          note: editNote.trim() || null,
          items: editLines.map((l) => ({ productId: l.productId, qty: l.qty, salePrice: l.salePrice })),
        },
      });
    },
    onSuccess: () => {
      invalidate();
      setEditDoc(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "Saqlashda xatolik"),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<StockOutDocument>(`/stock-out/${id}/cancel`, { method: "POST", body: { reason } }),
    onSuccess: () => {
      invalidate();
      setCancelDoc(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "Bekor qilishda xatolik"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/stock-out/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      setDeleteDoc(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "O'chirishda xatolik"),
  });

  function startEdit(doc: StockOutDocument) {
    setEditDoc(doc);
    setEditCustomerId(doc.contragentId ?? "");
    setEditNote(doc.note ?? "");
    setEditLines(
      doc.items.map((item) => ({
        productId: item.productId,
        name: item.productName ?? "—",
        sku: item.productSku ?? "",
        qty: Number(item.qty),
        salePrice: Number(item.salePrice ?? 0),
      })),
    );
    setDraftProductId("");
    setDraftQty("1");
    setDraftPrice("");
    setError(null);
  }

  function addEditLine() {
    if (!draftProduct) return;
    const qty = Number(draftQty) || 0;
    if (qty <= 0) {
      setError("Soni noldan katta bo'lishi kerak");
      return;
    }
    const price = Number(draftPrice) || 0;
    setEditLines((prev) => {
      const existing = prev.find((l) => l.productId === draftProduct.id);
      if (existing) {
        return prev.map((l) => (l.productId === draftProduct.id ? { ...l, qty: l.qty + qty, salePrice: price } : l));
      }
      return [...prev, { productId: draftProduct.id, name: draftProduct.name, sku: draftProduct.sku, qty, salePrice: price }];
    });
    setDraftProductId("");
    setDraftQty("1");
    setDraftPrice("");
    setError(null);
  }

  function updateEditLine(productId: string, patch: Partial<EditLine>) {
    setEditLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  }

  function removeEditLine(productId: string) {
    setEditLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  function selectDraftProduct(id: string) {
    setDraftProductId(id);
    const p = productsQuery.data?.find((x) => x.id === id);
    setDraftPrice(p?.defaultSalePrice ? String(Math.round(Number(p.defaultSalePrice))) : "0");
    setDraftQty("1");
  }

  function handleDelete(doc: StockOutDocument) {
    if (doc.status !== "DRAFT") {
      setError("Faqat qoralama hujjatni o'chirish mumkin. Tasdiqlangan hujjatni bekor qiling.");
      return;
    }
    setDeleteDoc(doc);
    setError(null);
  }

  return (
    <div className="space-y-4">
      {/* Chop etishda faqat ochilgan hujjat chiqadi — sahifaning qolgani emas. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #operation-print-area, #operation-print-area * { visibility: visible; }
          #operation-print-area {
            position: absolute; left: 0; top: 0; width: 100%;
            max-height: none; overflow: visible;
          }
          .print-hidden { display: none !important; }
          @page { margin: 12mm; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Operatsiyalar</h1>
          <p className="mt-1 text-sm text-slate-500">
            Barcha sotuv va qaytaruv hujjatlari. Har bir o&apos;zgarish faoliyat tarixiga yozib boriladi.
          </p>
        </div>
        <ExportCsvButton
          filename="operatsiyalar"
          columns={["Hujjat", "Sana", "Turi", "Mijoz", "Holati", "Summa"]}
          rows={docs.map((d) => [
            d.docNumber,
            formatDateTime(d.documentDate),
            DOC_TYPE_LABEL[d.docType] ?? d.docType,
            d.contragentName ?? "",
            STATUS_LABEL[d.status] ?? d.status,
            d.totalAmount ?? "",
          ])}
        />
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Sanadan</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Sanagacha</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <div className="min-w-48 flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Mijoz</label>
            <Input placeholder="Mijoz nomi bo'yicha qidirish..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Turi</label>
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">Barchasi</option>
              <option value="SALE">Sotuv</option>
              <option value="CUSTOMER_RETURN">Mijozdan qaytaruv</option>
              <option value="WRITEOFF">Hisobdan chiqarish</option>
            </select>
          </div>
        </CardBody>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3 w-10">№</th>
                <th className="px-3 py-3">Hujjat</th>
                <th className="px-3 py-3">Mijoz</th>
                <th className="px-3 py-3 text-right">Umumiy summa</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Turi</th>
                <th className="px-3 py-3">Foydalanuvchi</th>
                <th className="px-3 py-3">Ma&apos;lumot</th>
                <th className="px-3 py-3">Sana</th>
                <th className="px-3 py-3 w-36 text-center">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {docsQuery.isLoading && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-slate-400">
                    Yuklanmoqda...
                  </td>
                </tr>
              )}
              {docs.length === 0 && !docsQuery.isLoading && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-slate-400">
                    Hali operatsiya yo&apos;q
                  </td>
                </tr>
              )}
              {docs.map((doc, i) => (
                <Fragment key={doc.id}>
                  <tr className={doc.status === "CANCELLED" ? "bg-red-50/40" : "hover:bg-slate-50"}>
                    <td className="px-3 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">
                      <button
                        onClick={() => setExpandedId((id) => (id === doc.id ? null : doc.id))}
                        className="hover:underline"
                      >
                        {doc.docNumber}
                      </button>
                    </td>
                    <td className="px-3 py-3">{doc.contragentName ?? "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium">{formatMoney(doc.totalAmount)}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[doc.status] ?? ""}`}>
                        {STATUS_LABEL[doc.status] ?? doc.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{DOC_TYPE_LABEL[doc.docType] ?? doc.docType}</td>
                    <td className="px-3 py-3 text-slate-600">{doc.createdByName ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-500">{doc.note ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-500">{formatDateTime(doc.documentDate)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => {
                            setPrintAfterOpen(true);
                            setViewDoc(doc);
                          }}
                          aria-label="Chop etish"
                          title="Chop etish"
                          className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white hover:bg-brand-700"
                        >
                          <PrinterIcon />
                        </button>
                        <button
                          onClick={() => setViewDoc(doc)}
                          aria-label="Ko'rish"
                          title="Ko'rish"
                          className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white hover:bg-brand-700"
                        >
                          <EyeIcon />
                        </button>
                        <button
                          onClick={() => startEdit(doc)}
                          aria-label="Tahrirlash"
                          title="Tahrirlash"
                          className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white hover:bg-brand-700"
                        >
                          <PencilIcon />
                        </button>
                        <RowActions
                          editLabel="Tahrirlash"
                          deleteLabel={doc.status === "DRAFT" ? "O'chirish" : "O'chirish (faqat qoralama)"}
                          extraActions={[
                            { label: "Chekni ko'rish", onClick: () => setViewDoc(doc) },
                            ...(doc.status === "CONFIRMED"
                              ? [{ label: "Bekor qilish", onClick: () => setCancelDoc(doc) }]
                              : []),
                          ]}
                          onEdit={() => startEdit(doc)}
                          onDelete={() => handleDelete(doc)}
                        />
                      </div>
                    </td>
                  </tr>

                  {expandedId === doc.id && (
                    <tr>
                      <td colSpan={10} className="bg-slate-50 px-4 py-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Mahsulotlar</p>
                            <ul className="space-y-1 text-sm">
                              {doc.items.map((item) => (
                                <li key={item.id} className="flex justify-between gap-3">
                                  <span className="text-slate-700">
                                    {item.productName ?? "—"}
                                    <span className="ml-1 text-xs text-slate-400">
                                      {formatQuantity(item.qty)} × {formatMoney(item.salePrice)}
                                    </span>
                                  </span>
                                  <span className="tabular-nums font-medium">{formatMoney(item.lineTotal)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Hujjat tarixi — kim yaratgan, tasdiqlagan, bekor qilgan. */}
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Tarix</p>
                            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                              <dt className="text-slate-500">Yaratilgan</dt>
                              <dd className="text-slate-800">{formatDateTime(doc.createdAt)}</dd>
                              {doc.confirmedAt && (
                                <>
                                  <dt className="text-slate-500">Tasdiqlangan</dt>
                                  <dd className="text-emerald-700">{formatDateTime(doc.confirmedAt)}</dd>
                                </>
                              )}
                              {doc.cancelledAt && (
                                <>
                                  <dt className="text-slate-500">Bekor qilingan</dt>
                                  <dd className="text-red-700">{formatDateTime(doc.cancelledAt)}</dd>
                                </>
                              )}
                              {doc.cancelReason && (
                                <>
                                  <dt className="text-slate-500">Sababi</dt>
                                  <dd className="text-slate-800">{doc.cancelReason}</dd>
                                </>
                              )}
                              {doc.note && (
                                <>
                                  <dt className="text-slate-500">Izoh</dt>
                                  <dd className="text-slate-800">{doc.note}</dd>
                                </>
                              )}
                            </dl>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            {docs.length > 0 && (
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <tr>
                  <td colSpan={3} className="px-3 py-3 text-right text-sm font-semibold text-slate-700">
                    Umumiy summa:
                  </td>
                  <td className="px-3 py-3 text-right text-base font-bold tabular-nums text-slate-900">
                    {formatMoney(String(Math.round(grandTotal)))}
                  </td>
                  <td colSpan={6} className="px-3 py-3 text-xs text-slate-400">
                    {docs.length} ta hujjat (bekor qilinganlar summaga kirmaydi)
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Chek — termal chek ko'rinishida emas, oddiy jadval ro'yxati. */}
      <Modal
        open={!!viewDoc}
        onClose={() => setViewDoc(null)}
        title={viewDoc ? viewDoc.docNumber : "Hujjat"}
        width="xl"
        printable
      >
        {viewDoc && (
          <div className="space-y-4">
            <div id="operation-print-area" className="space-y-4">
            {/* Faqat chop etishda ko'rinadigan sarlavha — modal sarlavhasi
                bosma varaqqa tushmaydi. */}
            <div className="hidden text-center print:block">
              <p className="text-base font-bold">OBOISHOP</p>
              <p className="text-sm">{viewDoc.docNumber}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Status:</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[viewDoc.status] ?? ""}`}>
                    {STATUS_LABEL[viewDoc.status] ?? viewDoc.status}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Sotuv sanasi: </span>
                  <span className="font-medium text-slate-800">{formatDateTime(viewDoc.documentDate)}</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-slate-500">Foydalanuvchi: </span>
                  <span className="font-medium text-slate-800">{viewDoc.createdByName ?? "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Yaratilgan vaqti: </span>
                  <span className="font-medium text-slate-800">{formatDateTime(viewDoc.createdAt)}</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-slate-500">Turi: </span>
                  <span className="font-medium text-slate-800">{DOC_TYPE_LABEL[viewDoc.docType] ?? viewDoc.docType}</span>
                </div>
                <div>
                  <span className="text-slate-500">Mijoz: </span>
                  <span className="font-medium text-slate-800">{viewDoc.contragentName ?? "—"}</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 w-10">№</th>
                    <th className="px-3 py-2">Nomi</th>
                    <th className="px-3 py-2 text-right">Soni</th>
                    <th className="px-3 py-2">O&apos;lchov birligi</th>
                    <th className="px-3 py-2 text-right">O&apos;ram soni</th>
                    <th className="px-3 py-2">O&apos;ram nomi</th>
                    <th className="px-3 py-2 text-right">Narx</th>
                    <th className="px-3 py-2 text-right">Summa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewDoc.items.map((item, i) => {
                    const packSize = item.productPackSize ? Number(item.productPackSize) : 0;
                    const packs = packSize > 0 ? Math.floor(Number(item.qty) / packSize) : null;
                    return (
                      <tr key={item.id}>
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-900">{item.productName ?? "—"}</p>
                          {item.productSku && <p className="text-xs text-slate-500">{item.productSku}</p>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatQuantity(item.qty)}</td>
                        <td className="px-3 py-2 text-slate-600">{UNIT_LABEL[item.productUnit ?? ""] ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {packs === null ? <span className="text-slate-300">—</span> : packs}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{item.productPackName ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.salePrice)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(item.lineTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={7} className="px-3 py-2 text-right text-sm font-semibold text-slate-700">
                      Jami
                    </td>
                    <td className="px-3 py-2 text-right text-base font-bold tabular-nums text-slate-900">
                      {formatMoney(viewDoc.totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            </div>

            {(viewDoc.note || viewDoc.cancelReason) && (
              <dl className="space-y-1 text-sm">
                {viewDoc.note && (
                  <div className="flex gap-2">
                    <dt className="text-slate-500">Izoh:</dt>
                    <dd className="text-slate-800">{viewDoc.note}</dd>
                  </div>
                )}
                {viewDoc.cancelReason && (
                  <div className="flex gap-2">
                    <dt className="text-slate-500">Bekor qilish sababi:</dt>
                    <dd className="text-red-700">{viewDoc.cancelReason}</dd>
                  </div>
                )}
              </dl>
            )}

            <div className="print-hidden flex justify-end gap-3 border-t border-slate-200 pt-4">
              <Button variant="secondary" onClick={() => setViewDoc(null)}>
                Yopish
              </Button>
              <Button onClick={() => window.print()}>Chop etish</Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelDoc}
        title={cancelDoc ? `${cancelDoc.docNumber} — bekor qilish` : "Bekor qilish"}
        message="Hujjat bekor qilinadi: ombordan yechilgan tovar qaytariladi va kassadagi yozuv ham teskari qaytariladi. Bu amal faoliyat tarixiga yoziladi."
        reasonLabel="Bekor qilish sababi"
        reasonPlaceholder="masalan: mijoz qaytarib berdi"
        confirmLabel="Bekor qilish"
        cancelLabel="Yopish"
        pending={cancelMutation.isPending}
        onConfirm={(reason) => cancelDoc && cancelMutation.mutate({ id: cancelDoc.id, reason })}
        onClose={() => setCancelDoc(null)}
      />

      <ConfirmDialog
        open={!!deleteDoc}
        title={deleteDoc ? `${deleteDoc.docNumber} — o'chirish` : "O'chirish"}
        message="Qoralama hujjat butunlay o'chiriladi. Uni qaytarib bo'lmaydi."
        confirmLabel="O'chirish"
        pending={deleteMutation.isPending}
        onConfirm={() => deleteDoc && deleteMutation.mutate(deleteDoc.id)}
        onClose={() => setDeleteDoc(null)}
      />

      <Modal
        open={!!editDoc}
        onClose={() => {
          setEditDoc(null);
          setError(null);
        }}
        title={editDoc ? `${editDoc.docNumber} — tahrirlash` : "Tahrirlash"}
        width="lg"
      >
        {editDoc && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Mijoz</label>
                <CustomerPicker customers={customersQuery.data ?? []} value={editCustomerId} onChange={setEditCustomerId} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Izoh</label>
                <Input value={editNote} onChange={(e) => setEditNote(e.target.value)} />
              </div>
            </div>

            {/* Tovar qo'shish */}
            <div className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-[1fr_120px_140px_auto]">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Mahsulot</label>
                <ProductPicker products={productsQuery.data ?? []} value={draftProductId} onChange={selectDraftProduct} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Soni</label>
                <Input type="number" step="any" min={0} value={draftQty} onChange={(e) => setDraftQty(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Narx</label>
                <Input type="number" min={0} value={draftPrice} onChange={(e) => setDraftPrice(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button onClick={addEditLine} disabled={!draftProductId}>
                  Qo&apos;shish
                </Button>
              </div>
            </div>

            {/* Hujjat qatorlari */}
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 w-10">№</th>
                    <th className="px-3 py-2">Nomi</th>
                    <th className="px-3 py-2 text-right">Soni</th>
                    <th className="px-3 py-2 text-right">Narx</th>
                    <th className="px-3 py-2 text-right">Summa</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {editLines.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                        Hujjatda tovar qolmadi — yuqoridan qo&apos;shing.
                      </td>
                    </tr>
                  )}
                  {editLines.map((line, i) => (
                    <tr key={line.productId}>
                      <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{line.name}</p>
                        {line.sku && <p className="text-xs text-slate-500">{line.sku}</p>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          step="any"
                          min={0.001}
                          value={line.qty}
                          onChange={(e) => updateEditLine(line.productId, { qty: Math.max(0.001, Number(e.target.value)) })}
                          className="w-20 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          value={line.salePrice}
                          onChange={(e) => updateEditLine(line.productId, { salePrice: Math.max(0, Number(e.target.value)) })}
                          className="w-28 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatMoney(String(Math.round(line.qty * line.salePrice)))}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => removeEditLine(line.productId)}
                          aria-label="Qatorni o'chirish"
                          className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold text-slate-700">
                      Umumiy summa
                    </td>
                    <td className="px-3 py-2 text-right text-base font-bold tabular-nums text-slate-900">
                      {formatMoney(String(Math.round(editTotal)))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {editDoc.status === "CONFIRMED" && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Tovar yoki narx o&apos;zgartirilsa, eski hujjat avtomatik bekor qilinadi va o&apos;rniga
                <strong> yangi hujjat</strong> rasmiylashtiriladi — ombor qoldig&apos;i va kassa shunda to&apos;g&apos;ri
                qoladi. Ikkala amal ham faoliyat tarixida ko&apos;rinadi. Faqat mijoz yoki izohni o&apos;zgartirsangiz,
                hujjat raqami o&apos;zgarmaydi.
              </p>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setEditDoc(null);
                  setError(null);
                }}
              >
                Bekor qilish
              </Button>
              <Button
                onClick={() => updateMutation.mutate(editDoc)}
                disabled={updateMutation.isPending || editLines.length === 0}
              >
                {updateMutation.isPending ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
