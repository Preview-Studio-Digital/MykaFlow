import { useState, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { fmtCurrency } from "@/lib/finance-constants";
import { ChevronLeft } from "lucide-react";
import { type TxRow } from "./TransactionList";

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
  rows,
  accent,
  icon,
  type = "expense",
}: {
  title: string;
  rows: TxRow[];
  accent: string;
  icon: React.ReactNode;
  type?: "income" | "expense";
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const COLORS = type === "income" ? INCOME_COLORS : EXPENSE_COLORS;

  const data = useMemo(() => {
    if (selectedCategory) {
      // Drill down into sub-categories of the selected category
      const subMap: Record<string, number> = {};
      rows
        .filter((r) => r.type === type && r.category === selectedCategory)
        .forEach((r) => {
          // Extract sub-category from [Sub] description format
          const match = r.description?.match(/^\[(.*?)\]/);
          const subName = match ? match[1] : "Sem sub-categoria";
          subMap[subName] = (subMap[subName] || 0) + Number(r.amount);
        });
      
      return Object.entries(subMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    }

    // Default top-level categories
    const catMap: Record<string, number> = {};
    rows
      .filter((r) => r.type === type)
      .forEach((r) => {
        catMap[r.category] = (catMap[r.category] || 0) + Number(r.amount);
      });

    return Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [rows, selectedCategory, type]);

  const total = data.reduce((a, b) => a + b.value, 0);

  return (
    <div className="glass rounded-2xl p-6 h-full transition-all duration-300">
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedCategory && (
              <button
                onClick={() => setSelectedCategory(null)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                title="Voltar"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <h3 className="text-sm font-bold tracking-widest uppercase flex items-center gap-2" style={{ color: accent }}>
              {icon} {selectedCategory ? `${selectedCategory} (Detalhes)` : title}
            </h3>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Total: <span className="text-foreground font-bold">{fmtCurrency(total)}</span>
          </span>
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
                onClick={(entry) => !selectedCategory && setSelectedCategory(entry.name)}
                style={{ cursor: !selectedCategory ? "pointer" : "default" }}
              >
                {data.map((_, i) => (
                  <Cell 
                    key={i} 
                    fill={COLORS[i % COLORS.length]}
                    className="hover:opacity-80 transition-opacity"
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "oklch(0.18 0.05 255)",
                  border: "1px solid oklch(0.78 0.16 220 / 0.4)",
                  borderRadius: 12,
                  fontFamily: "Rajdhani",
                }}
                itemStyle={{ color: "white" }}
                labelStyle={{ color: "white" }}
                formatter={(v: number, name: string) => {
                  const percent = total > 0 ? ((v / total) * 100).toFixed(1) : "0.0";
                  return [`${fmtCurrency(v)} (${percent}%)`, name];
                }}
              />
              <Legend wrapperStyle={{ fontFamily: "Rajdhani", fontSize: 12, color: "white" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
