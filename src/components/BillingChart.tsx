"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { paymentMethodLabel, formatBRL } from "@/lib/format";

interface Slice {
  billingType: string;
  total: number;
  quantidade: number;
}

const COLORS = ["#a01a25", "#c8a14a", "#2563eb", "#16a34a", "#9333ea", "#64748b"];

export function BillingChart({ data }: { data: Slice[] }) {
  if (!data.length) {
    return (
      <p className="muted" style={{ padding: "40px 0", textAlign: "center" }}>
        Sem dados no período.
      </p>
    );
  }

  const chartData = data.map((d) => ({
    name: paymentMethodLabel(d.billingType),
    value: d.total,
    quantidade: d.quantidade,
  }));

  return (
    <div className="row" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <ResponsiveContainer width={220} height={220}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatBRL(v)} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ flex: 1, minWidth: 200 }}>
        <table>
          <tbody>
            {chartData.map((d, i) => (
              <tr key={d.name}>
                <td>
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: COLORS[i % COLORS.length],
                      marginRight: 8,
                    }}
                  />
                  {d.name}
                </td>
                <td className="muted">{d.quantidade}x</td>
                <td style={{ fontWeight: 700, textAlign: "right" }}>
                  {formatBRL(d.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
