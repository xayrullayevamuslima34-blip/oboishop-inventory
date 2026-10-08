"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Contragent, CreateStockOutDocumentInput, Product, StockOutDocument } from "@oboishop/shared";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { PrintPanel } from "@/components/print-panel";
import { SaleReceiptView } from "@/components/sale-receipt-view";
import { CustomerPicker } from "@/components/customer-picker";
import { ProductPicker } from "@/components/product-picker";
import { useAuth } from "@/lib/use-auth";

const UNIT_LABEL: Record<string, string> = { RULON: "rulon", DONA: "dona", METR: "m" };

interface CartLine {
  productId: string;
  name: string;
  sku: string;
  /** Har doim asosiy birlikda (dona/rulon/metr) — hujjatga shu yoziladi. */
  qty: number;
  /** Qadoq belgilangan mahsulotda "o'ram" rejimida soni qadoqda kiritiladi. */
  packName: string | null;
  packSize: number | null;
  byPack: boolean;
  salePrice: number;
  retailPrice: number;
  wholesalePrice: number | null;
}

// Tezkor sotuv — kassada tezlik uchun soddalashtirilgan ekran: shtrix-kod
// skanerlansa (yoki qo'lda kiritib Enter bosilsa) mahsulot avtomatik
// savatga qo'shiladi, so'ng bitta tugma bilan tasdiqlanadi. Sotuv hujjati
// fon rejimida SALE turidagi chiqim sifatida yoziladi. Uch bosqich (Tovar/Chek/To'lov) bitta sahifada birga
// ko'rinadi — raqamlangan yorliqlar shunchaki tez o'sha bo'limga o'tish
// uchun (pastga scroll), alohida "sahifalar" emas.
export default function QuickSalePage() {
  const queryClient = useQueryClient();
  const [scanInput, setScanInput] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [candidates, setCandidates] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Tasnif — faqat chop etiladigan chek uchun. Hujjatga, hisobotlarga va
  // operatsiyalar ro'yxatiga yozilmaydi: sotuvchi chekda mijozga qoldiradigan
  // qisqa eslatma, xolos. Sotuv tasdiqlangan paytdagi qiymati chek bilan
  // birga saqlanadi, kiritish maydoni esa keyingi sotuv uchun tozalanadi.
  const [tasnif, setTasnif] = useState("");
  const [receiptTasnif, setReceiptTasnif] = useState("");
  // Chap paneldagi "qator tayyorlash" formasi holati.
  const [draftProductId, setDraftProductId] = useState("");
  const [draftPrice, setDraftPrice] = useState("");
  const [draftQty, setDraftQty] = useState("1");
  const [draftByPack, setDraftByPack] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<StockOutDocument | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const customersQuery = useQuery({
    queryKey: ["contragents", "CUSTOMER"],
    queryFn: () => apiFetch<Contragent[]>("/contragents?type=CUSTOMER"),
  });
  // Chap paneldagi ochiladigan ro'yxat uchun — butun katalog bir marta olinadi.
  const productsQuery = useQuery({
    queryKey: ["products", "pos"],
    queryFn: () => apiFetch<(Product & { qtyOnHand: string })[]>("/products"),
  });
  const draftProduct = productsQuery.data?.find((p) => p.id === draftProductId) ?? null;

  // Sarlavhadagi vaqt — server/mijoz farqi hydration xatosi bermasin deb
  // faqat mijoz tomonida o'rnatiladi.
  const [now, setNow] = useState("");
  useEffect(() => {
    setNow(new Date().toLocaleString("uz-UZ"));
  }, [receipt]);

  function selectDraftProduct(id: string) {
    setDraftProductId(id);
    setDraftByPack(false);
    setDraftQty("1");
    const p = productsQuery.data?.find((x) => x.id === id);
    setDraftPrice(p?.defaultSalePrice ? String(Math.round(Number(p.defaultSalePrice))) : "0");
  }

  // Chap paneldagi forma bo'yicha savatga qator qo'shadi. "O'ram" rejimida
  // kiritilgan son qadoqda bo'ladi — asosiy birlikka aylantirib saqlaymiz.
  function addDraftToCart() {
    if (!draftProduct) return;
    const packSize = draftProduct.packSize ? Number(draftProduct.packSize) : null;
    const entered = Number(draftQty) || 0;
    const qty = draftByPack && packSize ? entered * packSize : entered;
    if (qty <= 0) {
      setError("Soni noldan katta bo'lishi kerak");
      return;
    }
    const price = Number(draftPrice) || 0;
    const unitPrice = draftByPack && packSize ? price / packSize : price;

    setCart((prev) => {
      const existing = prev.find((l) => l.productId === draftProduct.id);
      if (existing) {
        return prev.map((l) => (l.productId === draftProduct.id ? { ...l, qty: l.qty + qty, salePrice: unitPrice } : l));
      }
      return [
        ...prev,
        {
          productId: draftProduct.id,
          name: draftProduct.name,
          sku: draftProduct.sku,
          qty,
          packName: draftProduct.packName,
          packSize,
          byPack: draftByPack,
          salePrice: unitPrice,
          retailPrice: Number(draftProduct.defaultSalePrice ?? 0),
          wholesalePrice: draftProduct.wholesalePrice ? Number(draftProduct.wholesalePrice) : null,
        },
      ];
    });

    setDraftProductId("");
    setDraftPrice("");
    setDraftQty("1");
    setDraftByPack(false);
    setError(null);
  }
  useEffect(() => {
    inputRef.current?.focus();
  }, [receipt]);

  function addToCart(product: Product) {
    const salePrice = Math.round(Number(product.defaultSalePrice ?? 0));
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          qty: 1,
          packName: product.packName,
          packSize: product.packSize ? Number(product.packSize) : null,
          byPack: false,
          salePrice,
          retailPrice: Number(product.defaultSalePrice ?? 0),
          wholesalePrice: product.wholesalePrice ? Number(product.wholesalePrice) : null,
        },
      ];
    });
    setCandidates([]);
    setScanInput("");
    setError(null);
    inputRef.current?.focus();
  }

  async function handleScanSubmit() {
    const code = scanInput.trim();
    if (!code) return;
    setError(null);

    try {
      const product = await apiFetch<Product>(`/products/by-barcode/${encodeURIComponent(code)}`);
      addToCart(product);
      return;
    } catch (err) {
      if (!(err instanceof ApiClientError) || err.status !== 404) {
        setError(err instanceof ApiClientError ? err.message : "Qidirishda xatolik");
        return;
      }
    }

    // Not a known barcode — fall back to a name/SKU search.
    const results = await apiFetch<Product[]>(`/products?search=${encodeURIComponent(code)}`);
    if (results.length === 0) {
      setError(`"${code}" bo'yicha mahsulot topilmadi`);
    } else if (results.length === 1) {
      addToCart(results[0]!);
    } else {
      setCandidates(results.slice(0, 8));
    }
  }

  function updateQty(productId: string, qty: number) {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, qty: Math.max(0.001, qty) } : l)));
  }

  // "O'ram" rejimida foydalanuvchi qadoq sonini kiritadi, biz esa uni asosiy
  // birlikka aylantirib saqlaymiz — hujjat va ombor qoldig'i har doim asosiy
  // birlikda yuritiladi.
  function updatePackQty(productId: string, packs: number) {
    setCart((prev) =>
      prev.map((l) =>
        l.productId === productId && l.packSize ? { ...l, qty: Math.max(0.001, packs * l.packSize) } : l,
      ),
    );
  }

  function togglePackMode(productId: string) {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, byPack: !l.byPack } : l)));
  }

  function updatePrice(productId: string, price: number) {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, salePrice: Math.max(0, price) } : l)));
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  const total = cart.reduce((sum, l) => sum + l.qty * l.salePrice, 0);

  async function handleConfirmSale() {
    if (cart.length === 0) return;
    setSubmitting(true);
    setError(null);

    const input: CreateStockOutDocumentInput = {
      docType: "SALE",
      contragentId: customerId || null,
      documentDate: new Date().toISOString(),
      items: cart.map((l) => ({ productId: l.productId, qty: l.qty, salePrice: l.salePrice })),
    };

    let draft: StockOutDocument | undefined;
    try {
      draft = await apiFetch<StockOutDocument>("/stock-out", { method: "POST", body: input });
      const confirmed = await apiFetch<StockOutDocument>(`/stock-out/${draft.id}/confirm`, { method: "POST" });

      setReceipt(confirmed);
      setReceiptTasnif(tasnif.trim());
      setCart([]);
      setCustomerId("");
      setTasnif("");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["cash-box"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Sotuvni tasdiqlashda xatolik");
      // Don't leave an orphaned draft behind after a failed confirm (e.g.
      // insufficient stock) — the cashier will just retry with adjusted qty.
      if (draft) {
        await apiFetch(`/stock-out/${draft.id}`, { method: "DELETE" }).catch(() => {});
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (receipt) {
    return (
      <div className="max-w-sm space-y-4">
        <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Sotuv tasdiqlandi — {receipt.docNumber}
        </div>
        <PrintPanel onClose={() => setReceipt(null)}>
          <SaleReceiptView
            docNumber={receipt.docNumber}
            documentDate={receipt.documentDate}
            customerName={receipt.contragentName ?? null}
            note={receiptTasnif || null}
            items={receipt.items.map((item) => ({
              productName: item.productName ?? "",
              qty: item.qty,
              salePrice: item.salePrice,
              lineTotal: item.lineTotal,
            }))}
            totalAmount={receipt.totalAmount}
          />
        </PrintPanel>
        <Button onClick={() => setReceipt(null)}>Yangi sotuv</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <ReceiptIcon />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Kassa · POS</p>
            <h1 className="text-xl font-semibold text-slate-900">Yangi sotuv</h1>
          </div>
        </div>
        <p className="text-sm tabular-nums text-brand-600">{now}</p>
      </div>

      {/* Yuqori qator — mijoz va sotuvchi. */}
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Mijoz (ixtiyoriy)</label>
            <CustomerPicker customers={customersQuery.data ?? []} value={customerId} onChange={setCustomerId} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Xodim</label>
            <div className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              {user?.fullName ?? "—"}
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Chap panel — qatorni tayyorlab "Qo'shish". */}
        <Card>
          <CardBody className="flex h-full flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Mahsulot</label>
              <ProductPicker
                products={productsQuery.data ?? []}
                value={draftProductId}
                onChange={selectDraftProduct}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Chakana narx</label>
              <div className="flex">
                <Input
                  type="number"
                  min={0}
                  value={draftPrice}
                  onChange={(e) => setDraftPrice(e.target.value)}
                  className="rounded-r-none text-right"
                />
                <span className="flex items-center rounded-r-md border border-l-0 border-slate-300 bg-slate-50 px-3 text-xs text-slate-500">
                  so&apos;m
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Soni</label>
              <div className="flex">
                <Input
                  type="number"
                  min={0.001}
                  step="any"
                  value={draftQty}
                  onChange={(e) => setDraftQty(e.target.value)}
                  className="rounded-r-none text-right"
                />
                <span className="flex items-center rounded-r-md border border-l-0 border-slate-300 bg-slate-50 px-3 text-xs text-slate-500">
                  {draftByPack ? draftProduct?.packName || "o'ram" : UNIT_LABEL[draftProduct?.unit ?? ""] ?? "dona"}
                </span>
              </div>
              {draftProduct?.packSize ? (
                <div className="mt-1.5 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setDraftByPack(false)}
                    className={`rounded border px-2 py-0.5 text-xs ${
                      draftByPack ? "border-slate-300 text-slate-600 hover:bg-slate-100" : "border-slate-900 bg-slate-900 text-white"
                    }`}
                  >
                    {UNIT_LABEL[draftProduct.unit] ?? "dona"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftByPack(true)}
                    className={`rounded border px-2 py-0.5 text-xs ${
                      draftByPack ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {draftProduct.packName || "o'ram"} × {Number(draftProduct.packSize)}
                  </button>
                </div>
              ) : null}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="mt-auto flex items-center justify-between gap-3 pt-2">
              <Button onClick={addDraftToCart} disabled={!draftProductId}>
                Qo&apos;shish
              </Button>
              <p className="text-sm text-slate-500">
                Umumiy summa:{" "}
                <span className="text-base font-semibold text-slate-900">{formatMoney(String(Math.round(total)))}</span>
              </p>
            </div>
          </CardBody>
        </Card>

        {/* O'ng panel — skanerlash/qidiruv va chek qatorlari. */}
        <Card>
          <CardBody className="space-y-3">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <SearchIcon />
              </span>
              <Input
                ref={inputRef}
                autoFocus
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleScanSubmit();
                  }
                }}
                placeholder="Mahsulotni nomi, artikuli yoki shtrix-kodi bo'yicha qidiruv"
                className="pl-10"
              />
            </div>

            {candidates.length > 0 && (
              <div className="rounded-md border border-slate-200">
                {candidates.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span>
                      {p.name} <span className="text-xs text-slate-500">({p.sku})</span>
                    </span>
                    <span className="tabular-nums text-slate-500">{formatMoney(p.defaultSalePrice)}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2 w-10">№</th>
                    <th className="px-2 py-2">Nomi</th>
                    <th className="px-2 py-2 text-right">Soni</th>
                    <th className="px-2 py-2 text-right">O&apos;ram soni</th>
                    <th className="px-2 py-2 text-right">Narx</th>
                    <th className="px-2 py-2 text-right">Umumiy summa</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cart.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-2 py-10 text-center text-slate-400">
                        Chap tomondan tovar tanlab &quot;Qo&apos;shish&quot; bosing yoki shtrix-kodni skanerlang.
                      </td>
                    </tr>
                  )}
                  {cart.map((line, i) => (
                    <tr key={line.productId}>
                      <td className="px-2 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-2 py-2">
                        <p className="font-medium text-slate-900">{line.name}</p>
                        <p className="text-xs text-slate-500">{line.sku}</p>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Input
                          type="number"
                          min={0.001}
                          step="any"
                          value={line.qty}
                          onChange={(e) => updateQty(line.productId, Number(e.target.value))}
                          className="w-20 text-right"
                        />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                        {line.packSize ? (
                          <>
                            {Math.floor(line.qty / line.packSize)}
                            <span className="ml-1 text-xs text-slate-400">{line.packName || "o'ram"}</span>
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          value={line.salePrice}
                          onChange={(e) => updatePrice(line.productId, Number(e.target.value))}
                          className="w-28 text-right"
                        />
                        {line.wholesalePrice != null && (
                          <div className="mt-1 flex justify-end gap-1">
                            <button
                              type="button"
                              className="rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                              onClick={() => updatePrice(line.productId, line.retailPrice)}
                            >
                              Chakana
                            </button>
                            <button
                              type="button"
                              className="rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                              onClick={() => updatePrice(line.productId, line.wholesalePrice as number)}
                            >
                              Ulgurji
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">
                        {formatMoney(String(Math.round(line.qty * line.salePrice)))}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => removeLine(line.productId)}
                          aria-label="Qatorni o'chirish"
                          className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end border-t border-slate-200 pt-3 text-sm text-slate-500">
              Umumiy summa:
              <span className="ml-2 text-lg font-semibold text-slate-900">{formatMoney(String(Math.round(total)))}</span>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Pastki panel — tasnif va to'lov. */}
      <Card>
        <CardBody className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-64 flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Tasnif (chekda chiqadi)</label>
            <Input
              placeholder="masalan: yetkazib berish kerak, ertaga olib ketadi..."
              value={tasnif}
              onChange={(e) => setTasnif(e.target.value)}
            />
          </div>
          <Button onClick={handleConfirmSale} disabled={cart.length === 0 || submitting}>
            {submitting ? "Tasdiqlanmoqda..." : `To'lov · ${formatMoney(String(Math.round(total)))}`}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

function ReceiptIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 2h16v20l-3-2-3 2-3-2-3 2-3-2-1 2Z" />
      <line x1="8" y1="7" x2="16" y2="7" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="15" x2="12" y2="15" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

