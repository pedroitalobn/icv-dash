"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL } from "@/lib/format";

interface Bucket {
  faixa: string;
  total: number;
  quantidade: number;
}

const COLORS = ["#d23a47", "#e0884e", "#c8a14a", "#1d9d54", "#0a84ff"];

export function AmountBucketsChart({ data }: { data: Bucket[] }) {
  if (!data.length) {
    return (
      <p className="muted" style={{ padding: "40px 0", textAlign: "center" }}>
        Sem dados no período.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
        <XAxis
          dataKey="faixa"
          tick={{ fontSize: 12, fill: "#86868b" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `R$ ${Math.round(v / 1000)}k`}
          tick={{ fontSize: 12, fill: "#86868b" }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
          formatter={(v: number, _n, p) => [
            `${formatBRL(v)} · ${p.payload.quantidade} doações`,
            "Total",
          ]}
        />
        <Bar dataKey="total" radius={[8, 8, 0, 0]} maxBarSize={64}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
