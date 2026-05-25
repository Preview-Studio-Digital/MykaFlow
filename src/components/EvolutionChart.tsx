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
  Line,
  ComposedChart,
} from "recharts";
import { fmtCurrency, MONTHS_PT } from "@/lib/finance-constants";
import { Activity, ChevronLeft } from "lucide-react";
import { useState, useMemo, useEffect } from "react";

interface Tx {
  type: "income" | "expense";
  amount: number;
  occurred_on: string;
  category?: string;
  description?: string | null;
}

const CustomTooltip = ({ active, payload, label, isMonthly, year, month }: any) => {
  if (active && payload && payload.length) {
    if (isMonthly) {
      const saldo =
        payload.find((p: any) => p.dataKey === "saldo")?.value ?? (payload[0]?.value || 0);
      // Marcação de vencimento removida
      const daysOfWeek = [
        "Domingo",
        "Segunda-feira",
        "Terça-feira",
        "Quarta-feira",
        "Quinta-feira",
        "Sexta-feira",
        "Sábado",
      ];
      const d = new Date(year, month, parseInt(label));
      const dayName = !isNaN(d.getTime()) ? daysOfWeek[d.getDay()] : "";

      return (
        <div className="glass p-4 rounded-xl border border-white/10 backdrop-blur-md shadow-2xl z-[9999]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] mb-1 text-muted-foreground">
            Dia {label} • {dayName}
          </p>
          <div
            className="flex items-center justify-between gap-6 text-sm font-bold"
          >
            <span className="text-white">Saldo</span>
            <span className="font-mono text-white">{fmtCurrency(saldo)}</span>
          </div>
        </div>

      );
    } else {
      // Modo Anual (Receitas e Despesas)
      const receitas = payload.find((p: any) => p.dataKey === "receitas")?.value || 0;
      const despesas = payload.find((p: any) => p.dataKey === "despesas")?.value || 0;
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
            <div
              className="flex items-center justify-between gap-6 text-sm pt-2 mt-2 border-t border-white/10 font-bold"
            >
              <span className="text-white">Saldo</span>
              <span className="font-mono text-white">{fmtCurrency(saldo)}</span>
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
  dashboardMode,
  onDashboardModeChange,
  onMonthShift,
  canShiftPrev,
  canShiftNext,
  averageMonthlyExpense,
}: {
  data: Tx[];
  year: number;
  month: number;
  onMonthChange?: (m: number) => void;
  onMonthShift?: (delta: number) => void;
  forcedViewMode?: "annual" | "monthly";
  dashboardMode?: "monthly" | "annual";
  onDashboardModeChange?: (mode: "monthly" | "annual") => void;
  canShiftPrev?: boolean;
  canShiftNext?: boolean;
  averageMonthlyExpense?: number;
}) {
  const [viewMode, setViewMode] = useState<"annual" | "monthly">("annual");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveViewMode = forcedViewMode ?? viewMode;

  // Dados Anuais (por mês) - Agora mostrando o RESULTADO DO MÊS, não acumulado
  const annualData = useMemo(() => {
    if (!mounted) return [];
    const monthly = MONTHS_PT.map((m, i) => ({ month: m, receitas: 0, despesas: 0, idx: i }));
    
    for (const t of data) {
      const d = new Date(t.occurred_on + "T00:00:00");
      const amount = Number(t.amount) || 0;
      
      if (d.getFullYear() === year) {
        const m = monthly[d.getMonth()];
        if (m) {
          if (t.type === "income") m.receitas += amount;
          else m.despesas += amount;
        }
      }
    }

    let runningSaldo = 0;
    return monthly.map((m) => {
      // Saldo aqui agora é o ACUMULADO para mostrar a evolução
      runningSaldo += m.receitas - m.despesas;
      return { ...m, saldo: runningSaldo };
    });
  }, [data, year, mounted]);

  const annualBalance = useMemo(() => {
    return annualData[11]?.saldo || 0;
  }, [annualData]);

  // Dados Mensais (por dia) - Cumulativos
  const dailyData = useMemo(() => {
    if (effectiveViewMode === "annual" || !mounted) return [];

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => ({
      label: `${i + 1}`,
      receitas: 0,
      despesas: 0,
      day: i + 1,
    }));

    let initialBalance = 0;
    const startOfMonth = new Date(year, month, 1).getTime();

    for (const t of data) {
      const d = new Date(t.occurred_on + "T00:00:00");
      if (d.getFullYear() === year && d.getMonth() === month) {
        const dayIdx = d.getDate() - 1;
        const amount = Number(t.amount) || 0;
        if (days[dayIdx]) {
          if (t.type === "income") days[dayIdx].receitas += amount;
          else days[dayIdx].despesas += amount;
        }
      }
    }

    let runningSaldo = 0; // Começa do zero no dia 1º
    return days.map((d) => {
      runningSaldo += d.receitas - d.despesas;
      return {
        ...d,
        saldo: runningSaldo,
      };
    });
  }, [data, year, effectiveViewMode, month, mounted]);

  const currentAnnualBalance = useMemo(() => {
    return annualData[month]?.saldo || 0;
  }, [annualData, month]);

  // Cálculos para o modo Mensal
  const today = new Date();
  const currentMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);
  const targetMonthDate = new Date(year, month, 1);
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const isFutureMonth = targetMonthDate > currentMonthDate;
  const currentDay = today.getDate();

  const saldoAteHoje = useMemo(() => {
    if (dailyData.length === 0) return 0;
    // Limitamos ao dia de hoje apenas se estivermos visualizando o MÊS ATUAL.
    // Para meses passados ou futuros, mostramos o saldo total/final do mês.
    const limitDay = isCurrentMonth ? currentDay : 999;

    const relevantDays = dailyData.filter((d) => d.day <= limitDay);
    if (relevantDays.length === 0) return 0;
    return relevantDays[relevantDays.length - 1].saldo;
  }, [dailyData, isCurrentMonth, currentDay]);

  const projecaoMensal = useMemo(() => {
    if (dailyData.length === 0) return 0;
    // O saldo do último dia do array dailyData já representa o saldo final do mês (Realizado + Futuro)
    return dailyData[dailyData.length - 1].saldo;
  }, [dailyData]);

  const chartData = effectiveViewMode === "annual" ? annualData : dailyData;
  const currentMonthData = annualData[month] || { receitas: 0, despesas: 0 };
  const currentSaldo = (currentMonthData.receitas || 0) - (currentMonthData.despesas || 0);

  const { gradientOffset, globalDomain, yTicks } = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      return { gradientOffset: 0.5, globalDomain: [-100, 100], yTicks: undefined };
    }

    let minVal = 0;
    let maxVal = 0;

    if (effectiveViewMode === "annual") {
      const allVals = chartData.flatMap((d: any) => [d.receitas || 0, d.despesas || 0, d.saldo || 0]);
      maxVal = Math.max(...allVals, 0);
      minVal = Math.min(...allVals, 0);
    } else {
      const saldos = chartData.map((d: any) => Number(d.saldo) || 0);
      maxVal = Math.max(...saldos, 0);
      minVal = Math.min(...saldos, 0);
    }

    const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal)) * 1.1 || 100;
    const step = absMax / 5;
    const ticks = [];
    
    let domain: [number, number];
    let offset = 0.5;

    if (minVal < 0) {
      for (let i = -5; i <= 5; i++) {
        ticks.push(step * i);
      }
      domain = [-absMax, absMax];
      offset = 0.5;
    } else {
      for (let i = 0; i <= 5; i++) {
        ticks.push(step * i);
      }
      domain = [0, absMax];
      offset = 1;
    }

    return {
      gradientOffset: offset,
      globalDomain: domain,
      yTicks: ticks,
    };
  }, [chartData, effectiveViewMode]);

  const navigateMonth = (step: number) => {
    const next = (month + step + 12) % 12;
    onMonthChange?.(next);
  };

  if (!mounted) {
    return (
      <div className="h-[390px] w-full bg-white/5 animate-pulse rounded-2xl border-2 border-white/5" />
    );
  }

  return (
    <div
      className={`rounded-2xl transition-all duration-500 border-2 ${
        currentSaldo < 0
          ? "bg-red-500/10 border-red-500/30 shadow-[inset_0_0_50px_rgba(239,68,68,0.1)]"
          : "bg-cyan-500/10 border-cyan-500/30 shadow-[inset_0_0_50px_rgba(34,211,238,0.1)]"
      } backdrop-blur-md p-3`}
    >
      <div className="relative flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-4 pl-[58px] flex-wrap">
          {/* Title Toggle: MENSAL / ANUAL */}
          {onDashboardModeChange && dashboardMode ? (
            <div className="flex items-center gap-1.5 text-base font-black tracking-widest uppercase leading-tight select-none">
              {dashboardMode === "monthly" ? (
                <>
                  <span className="text-gradient drop-shadow-[0_0_8px_rgba(34,211,238,0.3)] scale-105">
                    SALDO MENSAL
                  </span>
                  <span className="text-muted-foreground/20 font-light mx-1">|</span>
                  <button
                    onClick={() => onDashboardModeChange("annual")}
                    className="text-muted-foreground/50 hover:text-white hover:scale-102 transition-all duration-300"
                  >
                    EVOLUÇÃO ANUAL
                  </button>
                </>
              ) : (
                <>
                  <span className="text-gradient drop-shadow-[0_0_8px_rgba(34,211,238,0.3)] scale-105">
                    EVOLUÇÃO ANUAL
                  </span>
                  <span className="text-muted-foreground/20 font-light mx-1">|</span>
                  <button
                    onClick={() => onDashboardModeChange("monthly")}
                    className="text-muted-foreground/50 hover:text-white hover:scale-102 transition-all duration-300"
                  >
                    SALDO MENSAL
                  </button>
                </>
              )}
            </div>
          ) : (
            <h3 className="text-base font-black tracking-widest uppercase text-gradient leading-tight">
              {effectiveViewMode === "annual" ? "EVOLUÇÃO ANUAL" : "SALDO MENSAL"}
            </h3>
          )}
        </div>

        {/* Absolute Centered Month/Year selector */}
        {onDashboardModeChange && dashboardMode && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/[0.03] border border-white/5 rounded-xl px-3 py-1 shadow-[0_0_10px_rgba(0,0,0,0.1)] z-10">
            <button
              disabled={!canShiftPrev}
              onClick={() => onMonthShift?.(dashboardMode === "annual" ? -12 : -1)}
              className={`text-muted-foreground transition-all flex items-center gap-1 group ${!canShiftPrev ? "opacity-20 cursor-not-allowed" : "hover:text-white hover:scale-110"}`}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="text-[9px] font-black tracking-widest opacity-30 group-hover:opacity-100 transition-opacity uppercase hidden md:inline">
                {dashboardMode === "annual" ? year - 1 : MONTHS_PT[(month + 11) % 12]}
              </span>
            </button>

            <span className="text-base font-black tracking-widest uppercase text-white min-w-[120px] text-center leading-tight">
              {dashboardMode === "annual" ? year : MONTHS_PT[month]}
            </span>

            <button
              disabled={!canShiftNext}
              onClick={() => onMonthShift?.(dashboardMode === "annual" ? 12 : 1)}
              className={`text-muted-foreground transition-all flex items-center gap-1 group ${!canShiftNext ? "opacity-20 cursor-not-allowed" : "hover:text-white hover:scale-110"}`}
            >
              <span className="text-[9px] font-black tracking-widest opacity-30 group-hover:opacity-100 transition-opacity uppercase hidden md:inline">
                {dashboardMode === "annual" ? year + 1 : MONTHS_PT[(month + 1) % 12]}
              </span>
              <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-4 pr-[60px]">
          {effectiveViewMode === "annual" ? (
            <>
              <div className="flex flex-col items-end">
                <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-bold">
                  Balanço até {MONTHS_PT[month]}
                </span>
                <span
                  className={`text-lg font-black font-mono tracking-tighter ${currentAnnualBalance >= 0 ? "text-accent drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]" : "text-red-400 drop-shadow-[0_0_6px_rgba(239,68,68,0.3)]"}`}
                >
                  {fmtCurrency(currentAnnualBalance)}
                </span>
              </div>

              <div className="flex flex-col items-end border-l border-white/10 pl-4">
                <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-bold">
                  Projeção Anual
                </span>
                <span
                  className={`text-lg font-black font-mono tracking-tighter ${annualBalance >= 0 ? "text-accent drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]" : "text-red-400 drop-shadow-[0_0_6px_rgba(239,68,68,0.3)]"}`}
                >
                  {fmtCurrency(annualBalance)}
                </span>
              </div>
            </>
          ) : (
            <>
              {isCurrentMonth && (
                <div className="flex flex-col items-end">
                  <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-bold">
                    Saldo até {currentDay} de {MONTHS_PT[month]}
                  </span>
                  <span
                    className={`text-lg font-black font-mono tracking-tighter ${saldoAteHoje >= 0 ? "text-accent drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]" : "text-red-400 drop-shadow-[0_0_6px_rgba(239,68,68,0.3)]"}`}
                  >
                    {fmtCurrency(saldoAteHoje)}
                  </span>
                </div>
              )}

              <div
                className={`flex flex-col items-end ${isCurrentMonth ? "border-l border-white/10 pl-4" : ""}`}
              >
                <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-bold">
                  {isCurrentMonth || isFutureMonth
                    ? "Projeção Mensal"
                    : `Saldo Final ${MONTHS_PT[month]}`}
                </span>
                <span
                  className={`text-lg font-black font-mono tracking-tighter ${(isCurrentMonth || isFutureMonth ? projecaoMensal : saldoAteHoje) >= 0 ? "text-accent drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]" : "text-red-400 drop-shadow-[0_0_6px_rgba(239,68,68,0.3)]"}`}
                >
                  {fmtCurrency(isCurrentMonth || isFutureMonth ? projecaoMensal : saldoAteHoje)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0} />
              </linearGradient>

              {/* Gradiente para preencher saldo positivo (verde) e negativo (vermelho) */}
              <linearGradient id="splitColorFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0.4} />
                <stop
                  offset={`${gradientOffset * 100}%`}
                  stopColor="oklch(0.8 0.16 150)"
                  stopOpacity={0.4}
                />
                <stop
                  offset={`${gradientOffset * 100}%`}
                  stopColor="oklch(0.7 0.2 30)"
                  stopOpacity={0.4}
                />
                <stop offset="100%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0.4} />
              </linearGradient>

              <linearGradient id="splitColorStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.8 0.16 150)" stopOpacity={1} />
                <stop
                  offset={`${gradientOffset * 100}%`}
                  stopColor="oklch(0.8 0.16 150)"
                  stopOpacity={1}
                />
                <stop
                  offset={`${gradientOffset * 100}%`}
                  stopColor="oklch(0.7 0.2 30)"
                  stopOpacity={1}
                />
                <stop offset="100%" stopColor="oklch(0.7 0.2 30)" stopOpacity={1} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(0.78 0.16 220 / 0.1)" strokeDasharray="3 3" />
            <XAxis
              dataKey={effectiveViewMode === "annual" ? "month" : "label"}
              scale="point"
              stroke="oklch(0.7 0.04 235)"
              fontSize={11}
              fontWeight="bold"
              axisLine={false}
              tickLine={false}
              padding={{ left: 0, right: 0 }}
              tickFormatter={(val) => (effectiveViewMode === "annual" ? val.slice(0, 3) : val)}
            />
            <YAxis
              yAxisId="left"
              width={58}
              domain={globalDomain}
              ticks={yTicks}
              stroke="oklch(0.7 0.04 235)"
              fontSize={11}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => {
                if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
                return `R$ ${v.toFixed(0)}`;
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              width={58}
              domain={globalDomain}
              ticks={yTicks}
              stroke="oklch(0.7 0.04 235)"
              fontSize={11}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => {
                if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
                return `R$ ${v.toFixed(0)}`;
              }}
            />

            {effectiveViewMode === "monthly" &&
              chartData.map((d: any, i: number) => {
                if (d.isVencimento) {
                  return (
                    <ReferenceLine
                      key={`venc-${i}`}
                      yAxisId="left"
                      x={d.label}
                      stroke="#facc15"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      label={(props: any) => {
                        return (
                          <text
                            x={props.viewBox.x}
                            y={props.viewBox.y - 10}
                            fill="#facc15"
                            fontSize={16}
                            textAnchor="middle"
                          >
                            ⚠️
                          </text>
                        );
                      }}
                    />
                  );
                }
                return null;
              })}

            <Tooltip
              cursor={false}
              content={
                <CustomTooltip
                  isMonthly={effectiveViewMode === "monthly"}
                  year={year}
                  month={month}
                />
              }
            />
            {effectiveViewMode === "annual" && (
              <Legend
                wrapperStyle={{ fontFamily: "Rajdhani", fontSize: 14, paddingTop: "20px" }}
                formatter={(value) => {
                  const colorClass = 
                    value === "Receitas" ? "text-accent" : 
                    value === "Despesas" ? "text-destructive" : 
                    "text-white/90";
                  return <span className={`${colorClass} font-bold tracking-wider`}>{value}</span>;
                }}
              />
            )}

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
                  fontWeight: "bold",
                }}
              />
            )}

            {effectiveViewMode === "monthly" && isCurrentMonth && (
              <ReferenceLine
                yAxisId="left"
                x={String(currentDay)}
                stroke="#22d3ee"
                strokeWidth={3}
                strokeOpacity={0.8}
                strokeDasharray="4 4"
                label={{
                  value: "HOJE",
                  position: "top",
                  fill: "#22d3ee",
                  fontSize: 11,
                  fontWeight: "bold",
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
            {/* Áreas de Preenchimento Técnicas (Usando Gradientes de Máscara) */}
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="saldo"
              stroke="none"
              fill="url(#splitColorFill)"
              baseValue={0}
              legendType="none"
              tooltipType="none"
              animationDuration={1000}
              hide={effectiveViewMode === "annual"}
            />

            {/* Modo Mensal: Saldo Contínuo e Colorido */}
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="saldo"
              stroke="url(#splitColorStroke)"
              strokeWidth={3}
              fill="none"
              name="Saldo"
              legendType="none"
              animationDuration={1000}
              hide={effectiveViewMode === "annual"}
            />

            {/* Modo Anual: Evolução Branca e Tracejada */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="saldo"
              stroke="white"
              strokeWidth={2}
              strokeDasharray="6 6"
              name="Saldo Acumulado"
              animationDuration={1000}
              dot={false}
              hide={effectiveViewMode === "monthly"}
            />

            {effectiveViewMode === "monthly" && (
              <ReferenceLine
                yAxisId="left"
                y={0}
                stroke="white"
                strokeWidth={1.5}
                strokeOpacity={0.8}
                strokeDasharray="4 4"
              />
            )}
            {chartData.length > 0 && (
              <>
                <ReferenceLine
                  yAxisId="left"
                  y={chartData[0].saldo}
                  stroke="oklch(0.78 0.16 220 / 0.4)"
                  strokeDasharray="2 2"
                  label={{
                    position: "insideLeft",
                    offset: 10,
                    value: `▶ ${Math.abs(chartData[0].saldo) >= 1000 ? (chartData[0].saldo / 1000).toFixed(1) + 'k' : chartData[0].saldo.toFixed(0)}`,
                    fill: chartData[0].saldo >= 0 ? "oklch(0.85 0.16 150)" : "oklch(0.7 0.2 30)",
                    fontSize: 11,
                    fontWeight: "900",
                  }}
                />
                <ReferenceLine
                  yAxisId="right"
                  y={chartData[chartData.length - 1].saldo}
                  stroke="oklch(0.78 0.16 220 / 0.4)"
                  strokeDasharray="2 2"
                  label={{
                    position: "insideRight",
                    offset: 10,
                    value: `${Math.abs(chartData[chartData.length - 1].saldo) >= 1000 ? (chartData[chartData.length - 1].saldo / 1000).toFixed(1) + 'k' : chartData[chartData.length - 1].saldo.toFixed(0)} ◀`,
                    fill: chartData[chartData.length - 1].saldo >= 0 ? "oklch(0.85 0.16 150)" : "oklch(0.7 0.2 30)",
                    fontSize: 11,
                    fontWeight: "900",
                  }}
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
