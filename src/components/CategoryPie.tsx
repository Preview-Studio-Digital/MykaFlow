import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { fmtCurrency } from "@/lib/finance-constants";

const COLORS = [
  "oklch(0.78 0.16 215)",
  "oklch(0.65 0.2 250)",
  "oklch(0.55 0.22 280)",
  "oklch(0.85 0.14 195)",
  "oklch(0.7 0.18 230)",
  "oklch(0.6 0.2 200)",
  "oklch(0.75 0.18 260)",
  "oklch(0.5 0.22 240)",
];

export function CategoryPie({
  title,
  data,
  accent,
  icon,
}: {
  title: string;
  data: { name: string; value: number }[];
  accent: string;
  icon: React.ReactNode;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="glass rounded-2xl p-6 h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold tracking-widest uppercase flex items-center gap-2" style={{ color: accent }}>
          {icon} {title}
        </h3>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Total: <span className="text-foreground font-bold">{fmtCurrency(total)}</span>
        </span>
      </div>
      {data.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Sem dados neste período
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={3}
                stroke="oklch(0.16 0.04 255)"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "oklch(0.18 0.05 255)",
                  border: "1px solid oklch(0.78 0.16 220 / 0.4)",
                  borderRadius: 12,
                  fontFamily: "Rajdhani",
                }}
                formatter={(v: number) => fmtCurrency(v)}
              />
              <Legend wrapperStyle={{ fontFamily: "Rajdhani", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
