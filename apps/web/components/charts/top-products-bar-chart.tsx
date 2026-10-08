"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Phase 15 — vizual hisobotlar. Foyda hisobotidagi mavjud `byProduct`
// ma'lumotidan foydalanadi, yangi API chaqiruvi kerak emas — shu sabab bu
// komponent xom qatorlarni props sifatida oladi, o'zi fetch qilmaydi.
export type TopProductBarDatum = { name: string; value: number };

const moneyFormatter = new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0, notation: "compact" });

function truncateName(name: string, max = 14) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

const BAR_COLORS = ["#2559c7", "#2f6fed", "#5b8def", "#8fb4f5", "#b9d1fa", "#d9e6fc"];

export function TopProductsBarChart({
  data,
  loading,
  emptyLabel = "Bu davrda ma'lumot yo'q",
}: {
  data: TopProductBarDatum[] | undefined;
  loading: boolean;
  emptyLabel?: string;
}) {
  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-400">Yuklanmoqda...</div>;
  }
  if (!data || data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-400">{emptyLabel}</div>;
  }

  const top = [...data]
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .map((d) => ({ ...d, shortName: truncateName(d.name) }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={top} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => moneyFormatter.format(v)}
            tick={{ fontSize: 12, fill: "#64748b" }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="shortName"
            tick={{ fontSize: 12, fill: "#334155" }}
            axisLine={false}
            tickLine={false}
            width={100}
          />
          <Tooltip
            formatter={(value) => `${new Intl.NumberFormat("uz-UZ").format(Number(value))} so'm`}
            labelFormatter={(_, payload) => (payload?.[0]?.payload as { name?: string })?.name ?? ""}
            contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 13 }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {top.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
