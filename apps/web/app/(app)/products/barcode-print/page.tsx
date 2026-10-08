"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import JsBarcode from "jsbarcode";
import type { Product } from "@oboishop/shared";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { useExchangeRates } from "@/lib/use-exchange-rates";

// Yorliq qog'ozlarining keng tarqalgan o'lchamlari (mm). Termal printerlar
// odatda shu ruloncha o'lchamlarida ishlaydi.
const PAPER_SIZES = [
  { id: "58x40", label: "58×40 mm", widthMm: 58, heightMm: 40 },
  { id: "50x30", label: "50×30 mm", widthMm: 50, heightMm: 30 },
  { id: "40x30", label: "40×30 mm", widthMm: 40, heightMm: 30 },
  { id: "30x20", label: "30×20 mm", widthMm: 30, heightMm: 20 },
];

const CURRENCIES = ["UZS", "USD", "EUR", "RUB"];

interface Settings {
  paperSize: string;
  currency: string;
  copies: number;
  nameSize: number;
  bigPriceSize: number;
  smallPriceSize: number;
  currencySize: number;
  codeSize: number;
  barcodeHeight: number;
  showSmallPrice: boolean;
  showName: boolean;
}

const DEFAULTS: Settings = {
  paperSize: "58x40",
  currency: "UZS",
  copies: 1,
  nameSize: 10,
  bigPriceSize: 16,
  smallPriceSize: 9,
  currencySize: 9,
  codeSize: 9,
  barcodeHeight: 34,
  showSmallPrice: true,
  showName: true,
};

const STORAGE_KEY = "oboishop_barcode_print_settings";

// Sozlamalar brauzerda saqlanadi — har chop etishda qaytadan sozlash shart
// emas (Hippo'dagi "Sozlamani saqlash" tugmasi bilan bir xil mantiq).
function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function Barcode({ value, height }: { value: string; height: number }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    // CODE128 — qo'lda kiritilgan kod EAN13 formatiga mos bo'lmasligi mumkin,
    // CODE128 esa istalgan matnni kodlaydi (labels sahifasidagi bilan bir xil).
    JsBarcode(ref.current, value, {
      format: "CODE128",
      width: 1.4,
      height,
      margin: 0,
      displayValue: false,
    });
  }, [value, height]);

  return <svg ref={ref} className="mx-auto block max-w-full" />;
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-sm text-slate-600">{label}</label>
        <span className="text-xs tabular-nums text-slate-400">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-600"
      />
    </div>
  );
}

// useSearchParams() statik prerender'ni to'xtatadi — Next.js talabiga ko'ra
// Suspense ichida bo'lishi kerak.
export default function BarcodePrintPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Yuklanmoqda...</p>}>
      <BarcodePrintContent />
    </Suspense>
  );
}

function BarcodePrintContent() {
  const router = useRouter();
  const params = useSearchParams();
  const productId = params.get("id");

  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  // localStorage server'da yo'q — birinchi render'dan keyin o'qiymiz.
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const productQuery = useQuery({
    queryKey: ["products", productId],
    queryFn: () => apiFetch<Product>(`/products/${productId}`),
    enabled: !!productId,
  });
  const product = productQuery.data;

  const { fromUzs } = useExchangeRates();

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setSaved(true);
    } catch {
      // Shaxsiy rejimda localStorage yopiq bo'lishi mumkin — sozlama
      // saqlanmasa ham chop etish ishlayveradi.
    }
  }

  const paper = PAPER_SIZES.find((p) => p.id === settings.paperSize) ?? PAPER_SIZES[0]!;

  // Narxni tanlangan valyutaga o'giramiz. Bazadagi narxlar so'mda.
  function priceIn(valueUzs: string | null): string {
    if (!valueUzs) return "—";
    const n = Number(valueUzs);
    if (settings.currency === "UZS") return Math.round(n).toLocaleString("uz-UZ");
    const converted = fromUzs(n, settings.currency);
    return converted === null ? "—" : converted.toFixed(2);
  }

  const labels = Array.from({ length: Math.max(1, settings.copies) });

  if (!productId) {
    return <p className="text-sm text-red-600">Mahsulot tanlanmagan.</p>;
  }
  if (productQuery.isLoading) return <p className="text-sm text-slate-400">Yuklanmoqda...</p>;
  if (!product) return <p className="text-sm text-red-600">Mahsulot topilmadi</p>;

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #barcode-print-area, #barcode-print-area * { visibility: visible; }
          #barcode-print-area { position: absolute; left: 0; top: 0; }
          @page { size: ${paper.widthMm}mm ${paper.heightMm}mm; margin: 0; }
          .label-sheet { page-break-after: always; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/products")}
            aria-label="Orqaga"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ←
          </button>
          <h1 className="text-xl font-semibold text-slate-900">Mahsulot shtrix kodlarini chop etish</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={saveSettings}>
            {saved ? "Saqlandi ✓" : "Sozlamani saqlash"}
          </Button>
          <Button onClick={() => window.print()}>Chop etish ({settings.copies} sht)</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] print:hidden">
        <Card>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Valyuta</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={settings.currency}
                  onChange={(e) => set("currency", e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Qog&apos;oz o&apos;lchami</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={settings.paperSize}
                  onChange={(e) => set("paperSize", e.target.value)}
                >
                  {PAPER_SIZES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Nusxalar soni</label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={settings.copies}
                  onChange={(e) => set("copies", Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-200 pt-4">
              <Slider
                label="Mahsulot nomini kattaligi"
                value={settings.nameSize}
                min={6}
                max={20}
                onChange={(v) => set("nameSize", v)}
              />
              <Slider
                label="Mahsulot katta narxini kattaligi"
                value={settings.bigPriceSize}
                min={8}
                max={32}
                onChange={(v) => set("bigPriceSize", v)}
              />
              <Slider
                label="Mahsulot kichik narxini kattaligi"
                value={settings.smallPriceSize}
                min={6}
                max={20}
                onChange={(v) => set("smallPriceSize", v)}
              />
              <Slider
                label="Mahsulot valyutasini kattaligi"
                value={settings.currencySize}
                min={6}
                max={20}
                onChange={(v) => set("currencySize", v)}
              />
              <Slider
                label="Mahsulot kodini kattaligi"
                value={settings.codeSize}
                min={6}
                max={18}
                onChange={(v) => set("codeSize", v)}
              />
              <Slider
                label="Shtrix-kod balandligi"
                value={settings.barcodeHeight}
                min={16}
                max={70}
                onChange={(v) => set("barcodeHeight", v)}
              />
            </div>

            <div className="flex flex-wrap gap-4 border-t border-slate-200 pt-4">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={settings.showName} onChange={(e) => set("showName", e.target.checked)} />
                Mahsulot nomi ko&apos;rsatilsin
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={settings.showSmallPrice}
                  onChange={(e) => set("showSmallPrice", e.target.checked)}
                />
                Ulgurji narx ko&apos;rsatilsin
              </label>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Ko&apos;rinishi</p>
            <div className="flex justify-center rounded-md bg-slate-50 p-4">
              <LabelView product={product} settings={settings} paper={paper} priceIn={priceIn} />
            </div>
            <p className="text-xs text-slate-400">
              Chop etishda printer sozlamalarida qog&apos;oz o&apos;lchami {paper.label} qilib tanlanganiga ishonch hosil qiling.
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Chop etiladigan maydon — ekranda ko'rinmaydi, faqat printerga chiqadi. */}
      <div id="barcode-print-area" className="hidden print:block">
        {labels.map((_, i) => (
          <div key={i} className="label-sheet">
            <LabelView product={product} settings={settings} paper={paper} priceIn={priceIn} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LabelView({
  product,
  settings,
  paper,
  priceIn,
}: {
  product: Product;
  settings: Settings;
  paper: (typeof PAPER_SIZES)[number];
  priceIn: (v: string | null) => string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center overflow-hidden bg-white text-center"
      style={{ width: `${paper.widthMm}mm`, height: `${paper.heightMm}mm`, padding: "1mm" }}
    >
      {settings.showName && (
        <div style={{ fontSize: `${settings.nameSize}px`, lineHeight: 1.1 }} className="w-full truncate font-medium">
          {product.name}
        </div>
      )}

      <div className="flex items-baseline justify-center gap-1">
        <span style={{ fontSize: `${settings.bigPriceSize}px`, lineHeight: 1.1 }} className="font-bold">
          {priceIn(product.defaultSalePrice)}
        </span>
        <span style={{ fontSize: `${settings.currencySize}px` }}>{settings.currency}</span>
      </div>

      {settings.showSmallPrice && product.wholesalePrice && (
        <div style={{ fontSize: `${settings.smallPriceSize}px`, lineHeight: 1.1 }} className="text-slate-600">
          {priceIn(product.wholesalePrice)} {settings.currency}
        </div>
      )}

      {product.barcode && <Barcode value={product.barcode} height={settings.barcodeHeight} />}

      <div style={{ fontSize: `${settings.codeSize}px`, lineHeight: 1.1 }} className="font-mono">
        {product.barcode ?? product.sku}
      </div>
    </div>
  );
}
