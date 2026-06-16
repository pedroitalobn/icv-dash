"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL } from "@/lib/format";

const PROJECT_COLORS: Record<string, string> = {
  "Cruz da Vida": "#b21e2b",
  "Deixai Vir a Mim": "#c8a14a",
  "Não classificado": "#86868b",
};
const FALLBACK = ["#0a84ff", "#1d9d54", "#5e5ce6"];

function fmtMonth(mes: string) {
  const [y, m] = mes.split("-");
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m) - 1] ?? m}/${y.slice(2)}`;
}

export function MonthlyProjectChart({
  data,
  projects,
}: {
  data: Array<Record<string, string | number>>;
  projects: string[];
}) {
  if (!data.length) {
    return (
      <p className="muted" style={{ padding: "40px 0", textAlign: "center" }}>
        Sem dados no período.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
        <XAxis
          dataKey="mes"
          tickFormatter={fmtMonth}
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
          labelFormatter={(l) => fmtMonth(String(l))}
          formatter={(v: number) => formatBRL(v)}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {projects.map((p, i) => (
          <Bar
            key={p}
            dataKey={p}
            stackId="a"
            fill={PROJECT_COLORS[p] ?? FALLBACK[i % FALLBACK.length]}
            radius={i === projects.length - 1 ? [8, 8, 0, 0] : [0, 0, 0, 0]}
            maxBarSize={56}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
