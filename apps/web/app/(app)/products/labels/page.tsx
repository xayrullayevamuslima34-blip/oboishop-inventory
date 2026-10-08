"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import JsBarcode from "jsbarcode";
import type { Product } from "@oboishop/shared";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

// Barcodes are printed with CODE128 rather than EAN13 — our own products
// always get a valid EAN13 from generateBarcode() (see apps/api/src/lib/barcode.ts),
// but a manually-entered barcode isn't guaranteed to be one, and EAN13
// encoding throws on anything that isn't exactly 12-13 digits. CODE128
// encodes arbitrary text/digits without that restriction, at the cost of a
// slightly less universally-recognized symbology for pure product barcodes.
function LabelBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (ref.current && value) {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        width: 1.6,
        height: 42,
        fontSize: 12,
        margin: 4,
        displayValue: true,
      });
    }
  }, [value]);

  return <svg ref={ref} />;
}

export default function ProductLabelsPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});

  const productsQuery = useQuery({
    queryKey: ["products", "labels", search],
    queryFn: () => apiFetch<Product[]>(`/products${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });

  function toggle(productId: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[productId]) delete next[productId];
      else next[productId] = 1;
      return next;
    });
  }

  function setQty(productId: string, qty: number) {
    setSelected((prev) => ({ ...prev, [productId]: Math.max(1, qty) }));
  }

  const labelItems = useMemo(() => {
    const items: { product: Product; price: string | null }[] = [];
    for (const product of productsQuery.data ?? []) {
      const qty = selected[product.id];
      if (!qty) continue;
      for (let i = 0; i < qty; i++) items.push({ product, price: product.defaultSalePrice });
    }
    return items;
  }, [selected, productsQuery.data]);

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #label-print-area, #label-print-area * { visibility: visible; }
          #label-print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Yorliq chop etish</h1>
          <p className="mt-1 text-sm text-slate-500">Mahsulotlarni tanlang, nusxalar sonini kiriting va chop eting.</p>
        </div>
        <Button onClick={() => window.print()} disabled={labelItems.length === 0}>
          Chop etish ({labelItems.length})
        </Button>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <Input placeholder="Qidirish (nomi, SKU, shtrix-kod)..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3"></th>
                <th className="px-4 py-3">Mahsulot</th>
                <th className="px-4 py-3">Shtrix-kod</th>
                <th className="px-4 py-3 text-right">Narx</th>
                <th className="px-4 py-3 text-right">Nusxalar soni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productsQuery.data?.map((p) => (
                <tr key={p.id} className={selected[p.id] ? "bg-brand-50" : undefined}>
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={!!selected[p.id]} onChange={() => toggle(p.id)} />
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-900">
                    {p.name} <span className="text-xs text-slate-500">({p.sku})</span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{p.barcode ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(p.defaultSalePrice)}</td>
                  <td className="px-4 py-2 text-right">
                    <Input
                      type="number"
                      min={1}
                      className="ml-auto w-20 text-right"
                      value={selected[p.id] ?? ""}
                      disabled={!selected[p.id]}
                      onChange={(e) => setQty(p.id, Number(e.target.value))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div id="label-print-area" className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
        {labelItems.map((item, i) => (
          <div key={i} className="flex flex-col items-center rounded-md border border-slate-300 p-3 text-center break-inside-avoid">
            <p className="w-full truncate text-xs font-medium text-slate-900">{item.product.name}</p>
            <p className="text-[10px] text-slate-500">{item.product.sku}</p>
            {item.product.barcode && <LabelBarcode value={item.product.barcode} />}
            <p className="mt-1 text-sm font-semibold text-slate-900">{item.price ? formatMoney(item.price) : "narx yo'q"}</p>
          </div>
        ))}
        {labelItems.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-slate-400 print:hidden">
            Chop etish uchun mahsulot tanlanmagan
          </p>
        )}
      </div>
    </div>
  );
}
