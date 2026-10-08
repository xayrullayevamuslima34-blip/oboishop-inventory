"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  PeriodReport,
  ProductActivityReport,
  ProfitReport,
  SalesReport,
  SalesTrend,
  StockValuationReport,
} from "@oboishop/shared";
import { apiFetch } from "@/lib/api-client";
import { formatMoney, formatQuantity } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { SalesTrendChart } from "@/components/charts/sales-trend-chart";
import { TopProductsBarChart } from "@/components/charts/top-products-bar-chart";

type Tab = "sales" | "profit" | "stock-valuation" | "period" | "product-activity";

const TABS: { key: Tab; label: string; needsPeriod: boolean }[] = [
  { key: "sales", label: "Sotuv", needsPeriod: true },
  { key: "profit", label: "Foyda", needsPeriod: true },
  { key: "stock-valuation", label: "Ombor qiymati", needsPeriod: false },
  { key: "period", label: "Davr bo'yicha", needsPeriod: true },
  { key: "product-activity", label: "Mahsulot faolligi", needsPeriod: true },
];

function moneyColor(value: string) {
  const n = Number(value);
  return n > 0 ? "text-emerald-600" : n < 0 ? "text-red-600" : "text-slate-500";
}

function toPeriodParams(from: string, to: string) {
  const fromIso = new Date(from).toISOString();
  const toIso = new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString();
  return `from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("sales");
  const [from, setFrom] = useState(() => new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [appliedFrom, setAppliedFrom] = useState(from);
  const [appliedTo, setAppliedTo] = useState(to);

  const period = toPeriodParams(appliedFrom, appliedTo);
  const activeTabMeta = TABS.find((t) => t.key === tab)!;

  const salesQuery = useQuery({
    queryKey: ["reports", "sales", period],
    queryFn: () => apiFetch<SalesReport>(`/reports/sales?${period}`),
    enabled: tab === "sales",
  });
  const salesTrendQuery = useQuery({
    queryKey: ["reports", "sales-trend", period],
    queryFn: () => apiFetch<SalesTrend>(`/reports/sales-trend?${period}`),
    enabled: tab === "sales",
  });
  const profitQuery = useQuery({
    queryKey: ["reports", "profit", period],
    queryFn: () => apiFetch<ProfitReport>(`/reports/profit?${period}`),
    enabled: tab === "profit",
  });
  const stockValuationQuery = useQuery({
    queryKey: ["reports", "stock-valuation"],
    queryFn: () => apiFetch<StockValuationReport>("/reports/stock-valuation"),
    enabled: tab === "stock-valuation",
  });
  const periodQuery = useQuery({
    queryKey: ["reports", "period", period],
    queryFn: () => apiFetch<PeriodReport>(`/reports/period?${period}`),
    enabled: tab === "period",
  });
  const productActivityQuery = useQuery({
    queryKey: ["reports", "product-activity", period],
    queryFn: () => apiFetch<ProductActivityReport>(`/reports/product-activity?${period}`),
    enabled: tab === "product-activity",
  });

  function applyPeriod() {
    setAppliedFrom(from);
    setAppliedTo(to);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Hisobotlar</h1>
        <p className="mt-1 text-sm text-slate-500">Sotuv, foyda, ombor qiymati va davr bo&apos;yicha hisobotlar.</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-t-md px-3 py-2 text-sm font-medium ${
              tab === t.key ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTabMeta.needsPeriod && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Boshlanish</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Tugash</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={applyPeriod}>
            Ko&apos;rish
          </Button>
        </div>
      )}

      {tab === "sales" && (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">Sotuv hisoboti</h2>
            <div className="flex flex-wrap items-center gap-4">
              {salesQuery.data && (
                <div className="flex gap-6 text-sm">
                  <span className="text-slate-500">
                    Hujjatlar: <span className="font-medium text-slate-900">{salesQuery.data.documentCount}</span>
                  </span>
                  <span className="text-slate-500">
                    Jami miqdor: <span className="font-medium text-slate-900">{formatQuantity(salesQuery.data.totalQty)}</span>
                  </span>
                  <span className="text-slate-500">
                    Jami tushum:{" "}
                    <span className="font-semibold tabular-nums text-slate-900">{formatMoney(salesQuery.data.totalRevenue)}</span>
                  </span>
                </div>
              )}
              <ExportCsvButton
                filename="sotuv-hisoboti"
                columns={["Mahsulot", "Miqdor", "Tushum"]}
                rows={(salesQuery.data?.byProduct ?? []).map((r) => [r.productName, r.qty, r.revenue])}
              />
            </div>
          </CardHeader>
          <CardBody className="border-b border-slate-200">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Kunlik tushum trendi</h3>
            <SalesTrendChart data={salesTrendQuery.data} loading={salesTrendQuery.isLoading} />
          </CardBody>
          <ReportTable
            columns={["Mahsulot", "Miqdor", "Tushum"]}
            rows={salesQuery.data?.byProduct.map((r) => [
              r.productName,
              formatQuantity(r.qty),
              formatMoney(r.revenue),
            ])}
            loading={salesQuery.isLoading}
          />
        </Card>
      )}

      {tab === "profit" && (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">Foyda hisoboti</h2>
            <div className="flex flex-wrap items-center gap-4">
              {profitQuery.data && (
                <div className="flex gap-6 text-sm">
                  <span className="text-slate-500">
                    Tushum: <span className="font-medium text-slate-900">{formatMoney(profitQuery.data.revenue)}</span>
                  </span>
                  <span className="text-slate-500">
                    Tan narx: <span className="font-medium text-slate-900">{formatMoney(profitQuery.data.costOfGoods)}</span>
                  </span>
                  <span className="text-slate-500">
                    Yalpi foyda:{" "}
                    <span className={`font-semibold tabular-nums ${moneyColor(profitQuery.data.grossProfit)}`}>
                      {formatMoney(profitQuery.data.grossProfit)}
                    </span>
                  </span>
                </div>
              )}
              <ExportCsvButton
                filename="foyda-hisoboti"
                columns={["Mahsulot", "Miqdor", "Tushum", "Tan narx", "Foyda"]}
                rows={(profitQuery.data?.byProduct ?? []).map((r) => [r.productName, r.qty, r.revenue, r.costOfGoods, r.profit])}
              />
            </div>
          </CardHeader>
          <CardBody className="border-b border-slate-200">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Eng foydali mahsulotlar</h3>
            <TopProductsBarChart
              data={profitQuery.data?.byProduct.map((r) => ({ name: r.productName, value: Number(r.profit) }))}
              loading={profitQuery.isLoading}
            />
          </CardBody>
          <ReportTable
            columns={["Mahsulot", "Miqdor", "Tushum", "Tan narx", "Foyda"]}
            rows={profitQuery.data?.byProduct.map((r) => [
              r.productName,
              formatQuantity(r.qty),
              formatMoney(r.revenue),
              formatMoney(r.costOfGoods),
              formatMoney(r.profit),
            ])}
            loading={profitQuery.isLoading}
          />
        </Card>
      )}

      {tab === "stock-valuation" && (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">Ombor qiymati (joriy holat)</h2>
            <div className="flex flex-wrap items-center gap-4">
              {stockValuationQuery.data && (
                <span className="text-sm text-slate-500">
                  Jami qiymat:{" "}
                  <span className="font-semibold tabular-nums text-slate-900">
                    {formatMoney(stockValuationQuery.data.totalValuation)}
                  </span>
                </span>
              )}
              <ExportCsvButton
                filename="ombor-qiymati"
                columns={["Mahsulot", "SKU", "Qoldiq", "Qiymat"]}
                rows={(stockValuationQuery.data?.items ?? []).map((r) => [r.productName, r.sku, r.qtyOnHand, r.valuation])}
              />
            </div>
          </CardHeader>
          <ReportTable
            columns={["Mahsulot", "SKU", "Qoldiq", "Qiymat"]}
            rows={stockValuationQuery.data?.items.map((r) => [r.productName, r.sku, formatQuantity(r.qtyOnHand), formatMoney(r.valuation)])}
            loading={stockValuationQuery.isLoading}
          />
        </Card>
      )}

      {tab === "period" && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-900">Davr bo&apos;yicha umumiy hisobot</h2>
          </CardHeader>
          <CardBody>
            {periodQuery.isLoading && <p className="text-sm text-slate-400">Yuklanmoqda...</p>}
            {periodQuery.data && (
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-slate-500">Sotuv tushumi</dt>
                  <dd className="tabular-nums text-lg font-semibold text-slate-900">{formatMoney(periodQuery.data.salesRevenue)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Tan narx</dt>
                  <dd className="tabular-nums text-lg font-semibold text-slate-900">{formatMoney(periodQuery.data.costOfGoods)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Yalpi foyda</dt>
                  <dd className={`tabular-nums text-lg font-semibold ${moneyColor(periodQuery.data.grossProfit)}`}>
                    {formatMoney(periodQuery.data.grossProfit)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Xarajatlar</dt>
                  <dd className="tabular-nums text-lg font-semibold text-red-600">{formatMoney(periodQuery.data.totalExpenses)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Sof foyda</dt>
                  <dd className={`tabular-nums text-lg font-semibold ${moneyColor(periodQuery.data.netProfit)}`}>
                    {formatMoney(periodQuery.data.netProfit)}
                  </dd>
                </div>
                <div />
                <div>
                  <dt className="text-slate-500">Kassaga kirim</dt>
                  <dd className="tabular-nums text-lg font-semibold text-emerald-600">{formatMoney(periodQuery.data.cashIn)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Kassadan chiqim</dt>
                  <dd className="tabular-nums text-lg font-semibold text-red-600">{formatMoney(periodQuery.data.cashOut)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Sof naqd oqim</dt>
                  <dd className={`tabular-nums text-lg font-semibold ${moneyColor(periodQuery.data.netCashFlow)}`}>
                    {formatMoney(periodQuery.data.netCashFlow)}
                  </dd>
                </div>
              </dl>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "product-activity" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Sotilmay qolgan mahsulotlar</h2>
                <p className="mt-1 text-xs text-slate-500">Omborda bor, lekin tanlangan davrda birorta ham sotilmagan</p>
              </div>
              <ExportCsvButton
                filename="sotilmay-qolgan-mahsulotlar"
                columns={["Mahsulot", "SKU", "Qoldiq", "Qiymat"]}
                rows={(productActivityQuery.data?.deadStock ?? []).map((r) => [r.productName, r.sku, r.qtyOnHand, r.valuation])}
              />
            </CardHeader>
            <ReportTable
              columns={["Mahsulot", "SKU", "Qoldiq", "Qiymat"]}
              rows={productActivityQuery.data?.deadStock.map((r) => [
                r.productName,
                r.sku,
                formatQuantity(r.qtyOnHand),
                formatMoney(r.valuation),
              ])}
              loading={productActivityQuery.isLoading}
            />
          </Card>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Zarariga sotilgan mahsulotlar</h2>
                <p className="mt-1 text-xs text-slate-500">Tan narxdan past narxda sotilgan mahsulotlar (tanlangan davrda)</p>
              </div>
              <ExportCsvButton
                filename="zarariga-sotilgan-mahsulotlar"
                columns={["Mahsulot", "Miqdor", "Tushum", "Tan narx", "Zarar"]}
                rows={(productActivityQuery.data?.soldAtLoss ?? []).map((r) => [
                  r.productName,
                  r.qty,
                  r.revenue,
                  r.costOfGoods,
                  r.loss,
                ])}
              />
            </CardHeader>
            <ReportTable
              columns={["Mahsulot", "Miqdor", "Tushum", "Tan narx", "Zarar"]}
              rows={productActivityQuery.data?.soldAtLoss.map((r) => [
                r.productName,
                formatQuantity(r.qty),
                formatMoney(r.revenue),
                formatMoney(r.costOfGoods),
                formatMoney(r.loss),
              ])}
              loading={productActivityQuery.isLoading}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

function ReportTable({
  columns,
  rows,
  loading,
}: {
  columns: string[];
  rows: string[][] | undefined;
  loading: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((c, i) => (
              <th key={c} className={`px-4 py-3 ${i > 0 ? "text-right" : ""}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-slate-400">
                Yuklanmoqda...
              </td>
            </tr>
          )}
          {!loading && rows?.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-slate-400">
                Ma&apos;lumot yo&apos;q
              </td>
            </tr>
          )}
          {rows?.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={`px-4 py-3 ${j > 0 ? "text-right tabular-nums" : "font-medium text-slate-900"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
