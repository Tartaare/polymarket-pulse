import { LineChart, Line, ReferenceLine, ResponsiveContainer, YAxis, XAxis, Tooltip } from "recharts";
import type { PricePoint } from "@/lib/sim/types";

export function PriceChart({
  data,
  priceToBeat,
  color = "var(--brand)",
}: {
  data: PricePoint[];
  priceToBeat: number;
  color?: string;
}) {
  const points = data.map((p) => ({ ts: p.ts, price: p.price }));
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => {
              const d = new Date(t);
              return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
            }}
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 10 }}
            minTickGap={40}
          />
          <YAxis
            dataKey="price"
            domain={["auto", "auto"]}
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
            width={60}
            orientation="right"
          />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--hairline)", fontSize: 12 }}
            labelFormatter={(t) => new Date(Number(t)).toLocaleTimeString()}
            formatter={(v) => [`$${Number(v).toFixed(2)}`, "Price"]}
          />
          <ReferenceLine y={priceToBeat} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="price" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
