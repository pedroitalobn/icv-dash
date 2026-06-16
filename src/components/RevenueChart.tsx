"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL } from "@/lib/format";

interface Point {
  dia: string;
  total: number;
}

export function RevenueChart({ data }: { data: Point[] }) {
  if (!data.length) {
    return (
      <p className="muted" style={{ padding: "40px 0", textAlign: "center" }}>
        Sem dados no período. Rode a sincronização para popular o painel.
      </p>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.dia).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={formatted} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#a01a25" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#a01a25" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
          tickFormatter={(v) => `R$ ${Number(v).toLocaleString("pt-BR")}`}
          width={80}
        />
        <Tooltip
          formatter={(v: number) => [formatBRL(v), "Arrecadado"]}
          labelFormatter={(l) => `Dia ${l}`}
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke="#a01a25"
          strokeWidth={2}
          fill="url(#rev)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
