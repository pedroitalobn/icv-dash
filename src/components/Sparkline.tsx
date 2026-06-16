"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

/** Mini gráfico de tendência (sem eixos) para colocar dentro de um card. */
export function Sparkline({
  data,
  color = "#1d9d54",
  id = "spark",
}: {
  data: number[];
  color?: string;
  id?: string;
}) {
  if (!data || !data.some((v) => v > 0)) return null;
  const d = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ marginTop: 10 }}>
      <ResponsiveContainer width="100%" height={38}>
        <AreaChart data={d} margin={{ top: 3, bottom: 0, left: 0, right: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            dataKey="v"
            stroke={color}
            strokeWidth={1.8}
            fill={`url(#${id})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
