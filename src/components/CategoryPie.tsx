import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { fmtCurrency } from "@/lib/finance-constants";

const EXPENSE_COLORS = [
  "oklch(0.7 0.2 30)",
  "oklch(0.6 0.18 25)",
  "oklch(0.5 0.16 20)",
  "oklch(0.8 0.15 35)",
  "oklch(0.65 0.22 32)",
  "oklch(0.55 0.2 28)",
  "oklch(0.75 0.17 38)",
  "oklch(0.45 0.15 22)",
];

const INCOME_COLORS = [
  "oklch(0.8 0.16 150)",
  "oklch(0.7 0.18 140)",
  "oklch(0.6 0.2 130)",
  "oklch(0.9 0.14 160)",
  "oklch(0.85 0.16 155)",
  "oklch(0.75 0.2 145)",
  "oklch(0.65 0.22 135)",
  "oklch(0.55 0.2 125)",
];

export function CategoryPie({
  title,
  data,
  accent,
  icon,
  type = "expense",
}: {
  title: string;
  data: { name: string; value: number }[];
  accent: string;
  icon: React.ReactNode;
  type?: "income" | "expense";
}) {
  const COLORS = type === "income" ? INCOME_COLORS : EXPENSE_COLORS;
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="glass rounded-2xl p-6 h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold tracking-widest uppercase flex items-center gap-2" style={{ color: accent }}>
          {icon} {title}
        </h3>
        <div className="text-lg font-bold tracking-widest uppercase flex items-center gap-2" style={{ color: accent }}>
          Total: {fmtCurrency(total)}
        </div>
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
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const { name, value, fill } = payload[0].payload;
                    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
                    return (
                      <div 
                        className="glass rounded-xl p-3 border shadow-2xl min-w-[140px]" 
                        style={{ 
                          borderColor: `${fill}44`,
                          backgroundColor: "oklch(0.15 0.05 255 / 0.9)",
                          backdropFilter: "blur(12px)"
                        }}
                      >
                        <p className="text-[10px] uppercase tracking-[0.2em] mb-1 font-bold opacity-70" style={{ color: fill }}>
                          {name}
                        </p>
                        <div className="flex flex-col gap-0">
                          <p className="text-base font-bold" style={{ color: fill }}>
                            {fmtCurrency(value)}
                          </p>
                          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: fill }}>
                            {percentage}% <span className="opacity-60 font-normal">do total</span>
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend wrapperStyle={{ fontFamily: "Rajdhani", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
