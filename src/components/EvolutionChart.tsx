import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { fmtCurrency, MONTHS_PT } from "@/lib/finance-constants";
import { Activity, ChevronLeft } from "lucide-react";
import { useState, useMemo } from "react";

interface Tx {
  type: "income" | "expense";
  amount: number;
  occurred_on: string;
}

const CustomTooltip = ({ active, payload, label, isMonthly }: any) => {
  if (active && payload && payload.length) {
    if (isMonthly) {
      const saldo = payload[0].value;
      return (
        <div className="glass p-4 rounded-xl border border-white/10 backdrop-blur-md shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] mb-2 border-b border-white/10 pb-2 text-muted-foreground">
            Dia {label}
          </p>
          <div className={`flex items-center justify-between gap-6 text-sm font-bold ${saldo >= 0 ? 'text-accent' : 'text-destructive'}`}>
            <span>Saldo Acumulado</span>
            <span className="font-mono">{fmtCurrency(saldo)}</span>
          </div>
        </div>
      );
    } else {
      // Modo Anual (Receitas e Despesas)
      const receitas = payload.find((p: any) => p.dataKey === 'receitas')?.value || 0;
      const despesas = payload.find((p: any) => p.dataKey === 'despesas')?.value || 0;
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
  }
  return null;
};

export function EvolutionChart({ 
  data, 
  year, 
  month, 
  onMonthChange,
  forcedViewMode,
}: { 
  data: Tx[]; 
  year: number; 
  month: number;
  onMonthChange?: (m: number) => void;
  forcedViewMode?: "annual" | "monthly";
}) {
  const [viewMode, setViewMode] = useState<"annual" | "monthly">("annual");
  const effectiveViewMode = forcedViewMode ?? viewMode;

  // Dados Anuais (por mês)
  const annualData = useMemo(() => {
    const monthly = MONTHS_PT.map((m, i) => ({ month: m, receitas: 0, despesas: 0, idx: i }));
    for (const t of data) {
      const d = new Date(t.occurred_on + "T00:00:00");
      if (d.getFullYear() !== year) continue;
      const m = monthly[d.getMonth()];
      if (t.type === "income") m.receitas += Number(t.amount);
      else m.despesas += Number(t.amount);
    }
    return monthly;
  }, [data, year]);

  const annualBalance = useMemo(() => {
    return annualData.reduce((acc, curr) => acc + (curr.receitas - curr.despesas), 0);
  }, [annualData]);

  // Dados Mensais (por dia) - Cumulativos
  const dailyData = useMemo(() => {
    if (effectiveViewMode === "annual") return [];
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => ({
      label: `${i + 1}/${month + 1}`,
      receitas: 0,
      despesas: 0,
      day: i + 1
    }));

    // 1. Primeiro, soma os valores exatos de cada dia
    for (const t of data) {
      const d = new Date(t.occurred_on + "T00:00:00");
      if (d.getFullYear() === year && d.getMonth() === month) {
        const dayIdx = d.getDate() - 1;
        if (days[dayIdx]) {
          if (t.type === "income") days[dayIdx].receitas += Number(t.amount);
          else days[dayIdx].despesas += Number(t.amount);
        }
      }
    }

    let runningSaldo = 0;
    return days.map(d => {
      runningSaldo += (d.receitas - d.despesas);
      return {
        ...d,
        saldo: runningSaldo
      };
    });
  }, [data, year, effectiveViewMode, month]);

  const currentAnnualBalance = useMemo(() => {
    return annualData.slice(0, month + 1).reduce((acc, curr) => acc + (curr.receitas - curr.despesas), 0);
  }, [annualData, month]);

  const chartData = effectiveViewMode === "annual" ? annualData : dailyData;
  const currentMonthData = annualData[month] || { receitas: 0, despesas: 0 };
  const currentSaldo = (currentMonthData.receitas || 0) - (currentMonthData.despesas || 0);

  const { gradientOffset, dataMin, dataMax } = useMemo(() => {
    if (dailyData.length === 0) return { gradientOffset: 1, dataMin: 0, dataMax: 0 };
    const max = Math.max(...dailyData.map((d) => d.saldo));
    const min = Math.min(...dailyData.map((d) => d.saldo));
    
    // All negative
    if (max <= 0) return { gradientOffset: 0, dataMin: min, dataMax: 0 };
    // All positive
    if (min >= 0) return { gradientOffset: 1, dataMin: 0, dataMax: max };
    
    // Mixed: use symmetric domain so zero is exactly at 50%
    const absMax = Math.max(Math.abs(max), Math.abs(min));
    return { 
      gradientOffset: 0.5,
      dataMin: -absMax,
      dataMax: absMax
    };
  }, [dailyData]);

  const handleChartClick = (state: any) => {
    if (state && state.activeTooltipIndex !== undefined) {
      onMonthChange?.(state.activeTooltipIndex);
    }
  };

  const navigateMonth = (step: number) => {
    const next = (month + step + 12) % 12;
    onMonthChange?.(next);
  };

  return (
    <div className={`rounded-2xl p-6 transition-all duration-500 border-2 ${ 
      currentSaldo < 0 
        ? "bg-red-500/10 border-red-500/30 shadow-[inset_0_0_50px_rgba(239,68,68,0.1)]" 
        : "bg-cyan-500/10 border-cyan-500/30 shadow-[inset_0_0_50px_rgba(34,211,238,0.1)]"
    } backdrop-blur-md p-4`}>
      <div className="flex items-center justify-between mb-4 px-[10px]">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-4">
            {viewMode === "monthly" && (
              <button 
                onClick={() => navigateMonth(-1)}
                className="p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-all"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            
            <h3 className="text-lg font-bold uppercase tracking-widest text-gradient flex items-center gap-2">
              <Activity className="h-6 w-6" /> 
              {effectiveViewMode === "annual" ? `Evolução Anual ${year}` : `Saldo Mensal: ${MONTHS_PT[month]}`}
            </h3>

            {viewMode === "monthly" && (
              <button 
                onClick={() => navigateMonth(1)}
                className="p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-all"
              >
                <Activity className="h-5 w-5 rotate-180 opacity-0 absolute" />
                <ChevronLeft className="h-5 w-5 rotate-180" />
              </button>
            )}
          </div>
          
          {effectiveViewMode === "monthly" && !forcedViewMode && (
            <button 
              onClick={() => setViewMode("annual")}
              className="flex items-center gap-1 text-[10px] uppercase font-black tracking-widest text-accent hover:text-white transition-all w-fit ml-10"
            >
              <ChevronLeft className="h-3 w-3" /> Voltar ao Anual
            </button>
          )}
        </div>

        <div className="flex items-center gap-8">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">
              Balanço até {MONTHS_PT[month]}
            </span>
            <span className={`text-2xl font-black font-mono tracking-tighter ${currentAnnualBalance >= 0 ? 'text-accent drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`}>
              {fmtCurrency(currentAnnualBalance)}
            </span>
          </div>

          <div className="flex flex-col items-end border-l border-white/10 pl-8">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">
              Projeção Anual
            </span>
            <span className={`text-2xl font-black font-mono tracking-tighter ${annualBalance >= 0 ? 'text-accent drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`}>
              {fmtCurrency(annualBalance)}
            </span>
          </div>
        </div>
      </div>

      <div className="h-52 cursor-pointer">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart 
            data={chartData} 
            onClick={handleChartClick}
            margin={{ top: 20, right: 60, left: 60, bottom: 0 }}
          >
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0} />
              </linearGradient>
              {/* Gradiente Split (Dinâmico Positivo/Negativo) */}
              <linearGradient id="splitColorFill" x1="0" y1="0" x2="0" y2="1">
                {gradientOffset >= 1 ? (
                  // All positive - pure green
                  <>
                    <stop offset="0%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0.1} />
                  </>
                ) : gradientOffset <= 0 ? (
                  // All negative - pure red
                  <>
                    <stop offset="0%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0.1} />
                  </>
                ) : (
                  // Mixed - sharp split at zero
                  <>
                    <stop offset="0%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0.5} />
                    <stop offset={`${(gradientOffset * 100).toFixed(2)}%`} stopColor="oklch(0.8 0.16 150)" stopOpacity={0.5} />
                    <stop offset={`${(gradientOffset * 100).toFixed(2)}%`} stopColor="oklch(0.7 0.2 30)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0.5} />
                  </>
                )}
              </linearGradient>
              <linearGradient id="splitColorStroke" x1="0" y1="0" x2="0" y2="1">
                {gradientOffset >= 1 ? (
                  <>
                    <stop offset="0%" stopColor="oklch(0.8 0.16 150)" stopOpacity={1} />
                    <stop offset="100%" stopColor="oklch(0.8 0.16 150)" stopOpacity={1} />
                  </>
                ) : gradientOffset <= 0 ? (
                  <>
                    <stop offset="0%" stopColor="oklch(0.7 0.2 30)" stopOpacity={1} />
                    <stop offset="100%" stopColor="oklch(0.7 0.2 30)" stopOpacity={1} />
                  </>
                ) : (
                  <>
                    <stop offset="0%" stopColor="oklch(0.8 0.16 150)" stopOpacity={1} />
                    <stop offset={`${(gradientOffset * 100).toFixed(2)}%`} stopColor="oklch(0.8 0.16 150)" stopOpacity={1} />
                    <stop offset={`${(gradientOffset * 100).toFixed(2)}%`} stopColor="oklch(0.7 0.2 30)" stopOpacity={1} />
                    <stop offset="100%" stopColor="oklch(0.7 0.2 30)" stopOpacity={1} />
                  </>
                )}
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(0.78 0.16 220 / 0.1)" strokeDasharray="3 3" />
            <XAxis 
              dataKey={effectiveViewMode === "annual" ? "month" : "label"} 
              stroke="oklch(0.7 0.04 235)" 
              fontSize={11} 
              fontWeight="bold"
              axisLine={false}
              tickLine={false}
              tickFormatter={(val) => effectiveViewMode === "annual" ? val.slice(0, 3) : val}
            />
            <YAxis
              yAxisId="left"
              domain={effectiveViewMode === "monthly" ? [dataMin, dataMax] : ['auto', 'auto']}
              stroke="oklch(0.7 0.04 235)"
              fontSize={11}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={effectiveViewMode === "monthly" ? [dataMin, dataMax] : ['auto', 'auto']}
              stroke="oklch(0.7 0.04 235)"
              fontSize={11}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip cursor={false} content={<CustomTooltip isMonthly={effectiveViewMode === "monthly"} />} />
            {effectiveViewMode === "annual" && <Legend wrapperStyle={{ fontFamily: "Rajdhani", fontSize: 14 }} />}
            
            {effectiveViewMode === "annual" && (
              <ReferenceLine 
                yAxisId="left"
                x={MONTHS_PT[month]} 
                stroke="#22d3ee" 
                strokeWidth={3}
                strokeOpacity={0.8} 
                strokeDasharray="4 4" 
                label={{ 
                  value: MONTHS_PT[month].slice(0, 3).toUpperCase(), 
                  position: "top", 
                  fill: "#22d3ee", 
                  fontSize: 11, 
                  fontWeight: "bold"
                }}
              />
            )}

            <Area
              yAxisId="left"
              type="monotone"
              dataKey="receitas"
              stroke="oklch(0.8 0.16 150)"
              strokeWidth={2.5}
              fill="url(#incomeGrad)"
              name="Receitas"
              animationDuration={1000}
              hide={effectiveViewMode !== "annual"}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="despesas"
              stroke="oklch(0.7 0.2 30)"
              strokeWidth={2.5}
              fill="url(#expenseGrad)"
              name="Despesas"
              animationDuration={1000}
              hide={effectiveViewMode !== "annual"}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="saldo"
              stroke="url(#splitColorStroke)"
              strokeWidth={3}
              fill="url(#splitColorFill)"
              name="Saldo Acumulado"
              legendType="none"
              animationDuration={1000}
              hide={effectiveViewMode === "annual"}
            />

            {/* Invisible Area to sync Right Axis scale */}
            <Area
              yAxisId="right"
              type="monotone"
              dataKey={effectiveViewMode === "annual" ? "receitas" : "saldo"}
              stroke="transparent"
              fill="transparent"
              legendType="none"
              tooltipType="none"
              animationDuration={0}
            />

            {effectiveViewMode === "monthly" && (
              <ReferenceLine 
                yAxisId="left"
                y={0} 
                stroke="white" 
                strokeWidth={1} 
                strokeOpacity={0.5} 
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
