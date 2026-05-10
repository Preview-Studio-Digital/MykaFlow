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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const receitas = payload[0].value;
    const despesas = payload[1].value;
    const saldo = receitas - despesas;

    return (
      <div className="glass p-4 rounded-xl border border-white/10 backdrop-blur-md shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] mb-2 border-b border-white/10 pb-2 text-muted-foreground">
          {label} {new Date().getFullYear()}
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-6 text-sm">
            <span className="flex items-center gap-2 text-accent/80">
              <div className="h-2 w-2 rounded-full bg-accent" /> Receitas
            </span>
            <span className="font-mono font-bold text-accent">{fmtCurrency(receitas)}</span>
          </div>
          <div className="flex items-center justify-between gap-6 text-sm">
            <span className="flex items-center gap-2 text-destructive/80">
              <div className="h-2 w-2 rounded-full bg-destructive" /> Despesas
            </span>
            <span className="font-mono font-bold text-destructive">{fmtCurrency(despesas)}</span>
          </div>
          <div className={`flex items-center justify-between gap-6 text-sm pt-2 mt-2 border-t border-white/10 font-bold ${saldo >= 0 ? 'text-accent' : 'text-destructive'}`}>
            <span>Saldo Mensal</span>
            <span className="font-mono">{fmtCurrency(saldo)}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export function EvolutionChart({ data, year, month }: { data: Tx[]; year: number; month: number }) {
  const monthly = MONTHS_PT.map((m, i) => ({ month: m, receitas: 0, despesas: 0, idx: i }));
  for (const t of data) {
    const d = new Date(t.occurred_on + "T00:00:00");
    if (d.getFullYear() !== year) continue;
    const m = monthly[d.getMonth()];
    if (t.type === "income") m.receitas += Number(t.amount);
    else m.despesas += Number(t.amount);
  }

  const monthData = monthly[month];
  const monthSaldo = monthData.receitas - monthData.despesas;

  return (
    <div className={`rounded-2xl p-6 transition-all duration-500 border-2 ${ 
      monthSaldo < 0 
        ? "bg-red-500/10 border-red-500/30 shadow-[inset_0_0_50px_rgba(239,68,68,0.1)]" 
        : "bg-cyan-500/10 border-cyan-500/30 shadow-[inset_0_0_50px_rgba(34,211,238,0.1)]"
    } backdrop-blur-md`}>
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-lg font-bold uppercase tracking-widest text-gradient flex items-center gap-2">
          <Activity className="h-6 w-6" /> Evolução Anual {year}
        </h3>
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Saldo de {MONTHS_PT[month]}</span>
          <span className={`text-2xl font-black font-mono tracking-tighter ${monthSaldo >= 0 ? 'text-accent drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`}>
            {fmtCurrency(monthSaldo)}
          </span>
        </div>
      </div>
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
            <XAxis 
              dataKey="month" 
              stroke="oklch(0.7 0.04 235)" 
              fontSize={13} 
              tickFormatter={(m) => m.slice(0, 3)}
            />
            <YAxis
              stroke="oklch(0.7 0.04 235)"
              fontSize={11}
              tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontFamily: "Rajdhani", fontSize: 14 }} />
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
