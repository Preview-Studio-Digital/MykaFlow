import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fmtCurrency } from "@/lib/finance-constants";
import { CalendarDays } from "lucide-react";
import { type TxRow } from "./TransactionList";

export function DailyChart({ rows, month, year }: { rows: TxRow[]; month: number; year: number }) {
  // Get number of days in the month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const dailyData = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    receitas: 0,
    despesas: 0,
    saldo: 0,
  }));

  rows.forEach((r) => {
    // Robust date parsing: handle both YYYY-MM-DD and full ISO strings
    const dateStr = r.occurred_on.includes("T") ? r.occurred_on : `${r.occurred_on}T00:00:00`;
    const d = new Date(dateStr);
    
    if (!isNaN(d.getTime())) {
      const dayIdx = d.getDate() - 1;
      if (dayIdx >= 0 && dayIdx < dailyData.length) {
        if (r.type === "income") dailyData[dayIdx].receitas += Number(r.amount);
        else dailyData[dayIdx].despesas += Number(r.amount);
      }
    }
  });

  // Make it cumulative
  let cumulativeIncome = 0;
  let cumulativeExpense = 0;
  dailyData.forEach(d => {
    cumulativeIncome += d.receitas;
    cumulativeExpense += d.despesas;
    d.receitas = cumulativeIncome;
    d.despesas = cumulativeExpense;
    d.saldo = cumulativeIncome - cumulativeExpense;
  });

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-sm font-bold uppercase tracking-widest text-gradient flex items-center gap-2 mb-4">
        <CalendarDays className="h-5 w-5" /> Evolução Mensal
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dailyData}>
            <defs>
              <linearGradient id="dailyIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="dailyExpenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="dailyBalanceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="white" stopOpacity={0.2} />
                <stop offset="100%" stopColor="white" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(0.78 0.16 220 / 0.05)" vertical={false} />
            <XAxis 
              dataKey="day" 
              stroke="oklch(0.7 0.04 235)" 
              fontSize={10} 
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="oklch(0.7 0.04 235)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `R$ ${(v / 1000).toFixed(1)}k`}
            />
            <Tooltip
              contentStyle={{
                background: "oklch(0.18 0.05 255)",
                border: "1px solid oklch(0.78 0.16 220 / 0.4)",
                borderRadius: 12,
                fontFamily: "Rajdhani",
              }}
              itemStyle={{ color: "white" }}
              labelStyle={{ color: "white" }}
              labelFormatter={(day) => `Dia ${day}`}
              formatter={(v: number) => fmtCurrency(v)}
            />
            <Area
              type="monotone"
              dataKey="receitas"
              stroke="oklch(0.8 0.16 150)"
              strokeWidth={2}
              fill="url(#dailyIncomeGrad)"
              name="Receitas"
            />
            <Area
              type="monotone"
              dataKey="despesas"
              stroke="oklch(0.7 0.2 30)"
              strokeWidth={2}
              fill="url(#dailyExpenseGrad)"
              name="Despesas"
            />
            <Area
              type="monotone"
              dataKey="saldo"
              stroke="white"
              strokeWidth={3}
              fill="url(#dailyBalanceGrad)"
              name="Saldo"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
