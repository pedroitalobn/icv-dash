"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { statusLabel, formatBRL } from "@/lib/format";

interface Slice {
  status: string;
  total: number;
  quantidade: number;
}

const STATUS_COLORS: Record<string, string> = {
  paid: "#1d9d54",
  confirmed: "#0a84ff",
  pending: "#b8860b",
  overdue: "#d33d3d",
  refunded: "#8e8e93",
  chargeback: "#5e5ce6",
  cancelled: "#c7c7cc",
  failed: "#86868b",
};

export function StatusChart({ data }: { data: Slice[] }) {
  if (!data.length) {
    return (
      <p className="muted" style={{ padding: "40px 0", textAlign: "center" }}>
        Sem dados no período.
      </p>
    );
  }
  const chartData = data.map((d) => ({
    name: statusLabel(d.status),
    value: d.total,
    quantidade: d.quantidade,
    color: STATUS_COLORS[d.status] ?? "#86868b",
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
            {chartData.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatBRL(v)} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ flex: 1, minWidth: 220 }}>
        <table>
          <tbody>
            {chartData.map((d) => (
              <tr key={d.name}>
                <td>
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: d.color,
                      marginRight: 8,
                    }}
                  />
                  {d.name}
                </td>
                <td className="muted">{d.quantidade}x</td>
                <td style={{ fontWeight: 600, textAlign: "right" }}>
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
