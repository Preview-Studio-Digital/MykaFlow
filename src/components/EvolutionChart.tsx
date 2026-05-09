import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { fmtCurrency, MONTHS_PT } from "@/lib/finance-constants";
import { Activity } from "lucide-react";

interface Tx {
  type: "income" | "expense";
  amount: number;
  occurred_on: string;
}

export function EvolutionChart({ data, year }: { data: Tx[]; year: number }) {
  const monthly = MONTHS_PT.map((m, i) => ({ month: m.slice(0, 3), receitas: 0, despesas: 0, idx: i }));
  for (const t of data) {
    const d = new Date(t.occurred_on + "T00:00:00");
    if (d.getFullYear() !== year) continue;
    const m = monthly[d.getMonth()];
    if (t.type === "income") m.receitas += Number(t.amount);
    else m.despesas += Number(t.amount);
  }

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-base font-bold uppercase tracking-widest text-gradient flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5" /> Evolução {year}
      </h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={monthly}>
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(0.78 0.16 220 / 0.1)" strokeDasharray="3 3" />
            <XAxis dataKey="month" stroke="oklch(0.7 0.04 235)" fontSize={11} />
            <YAxis
              stroke="oklch(0.7 0.04 235)"
              fontSize={11}
              tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
            />
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
            <Area
              type="monotone"
              dataKey="receitas"
              stroke="oklch(0.8 0.16 150)"
              strokeWidth={2.5}
              fill="url(#incomeGrad)"
              name="Receitas"
            />
            <Area
              type="monotone"
              dataKey="despesas"
              stroke="oklch(0.7 0.2 30)"
              strokeWidth={2.5}
              fill="url(#expenseGrad)"
              name="Despesas"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
