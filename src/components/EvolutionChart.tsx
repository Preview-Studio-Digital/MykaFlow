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

const CustomTooltip = ({ active, payload, label, isMonthly, year, month }: any) => {
  if (active && payload && payload.length) {
    if (isMonthly) {
      const saldo = payload.find((p: any) => p.dataKey === "saldo")?.value ?? (payload[0]?.value || 0);
      const daysOfWeek = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
      const d = new Date(year, month, parseInt(label));
      const dayName = !isNaN(d.getTime()) ? daysOfWeek[d.getDay()] : "";

      return (
        <div className="glass p-4 rounded-xl border border-white/10 backdrop-blur-md shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] mb-1 text-muted-foreground">
            Dia {label} • {dayName}
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
  dashboardMode,
  onDashboardModeChange,
  onMonthShift,
  canShiftPrev,
  canShiftNext,
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
      label: `${i + 1}`,
      receitas: 0,
      despesas: 0,
      day: i + 1
    }));

    // 1. Soma os valores exatos de cada dia
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
    
    const relevantDays = dailyData.filter(d => d.day <= limitDay);
    if (relevantDays.length === 0) return 0;
    return relevantDays[relevantDays.length - 1].saldo;
  }, [dailyData, isCurrentMonth, currentDay]);

  const projecaoMensal = useMemo(() => {
    if (dailyData.length === 0) return 0;
    if (!isCurrentMonth) return dailyData[dailyData.length - 1].saldo;
    
    const daysInMonth = dailyData.length;
    // Evitar divisão por zero e garantir que a projeção faça sentido
    const dayForCalc = Math.max(1, currentDay);
    
    // Se o usuário já lançou o mês inteiro (futuro), a projeção é o próprio saldo final
    const lastBalance = dailyData[dailyData.length - 1].saldo;
    const basicProj = (saldoAteHoje / dayForCalc) * daysInMonth;
    
    // Se o saldo final conhecido (incluindo futuro) for diferente do saldo até hoje,
    // significa que o usuário já tem lançamentos futuros. 
    // Nesse caso, o "Saldo Final" do gráfico é uma projeção mais real do que o cálculo matemático.
    if (Math.abs(lastBalance - saldoAteHoje) > 0.01) {
      return lastBalance;
    }

    return basicProj; 
  }, [dailyData, saldoAteHoje, isCurrentMonth, currentDay]);

  const chartData = effectiveViewMode === "annual" ? annualData : dailyData;
  const currentMonthData = annualData[month] || { receitas: 0, despesas: 0 };
  const currentSaldo = (currentMonthData.receitas || 0) - (currentMonthData.despesas || 0);

  const { gradientOffset, dataMin, dataMax } = useMemo(() => {
    const vals = chartData.map((d: any) => d.saldo).filter((v: any) => v !== undefined);
    if (vals.length === 0) return { gradientOffset: 1, dataMin: 0, dataMax: 0 };
    
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    
    // Se for tudo positivo
    if (min >= 0) return { gradientOffset: 1, dataMin: 0, dataMax: max * 1.1 };
    // Se for tudo negativo
    if (max <= 0) return { gradientOffset: 0, dataMin: min * 1.1, dataMax: 0 };
    
    const range = max - min;
    
    // Para o gradiente da linha de contorno bater com o zero
    // o domínio total é [min, max]. O zero está em max / range do topo.
    return { 
      gradientOffset: max / range,
      dataMin: min,
      dataMax: max
    };
  }, [chartData]);


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
      <div className="relative flex items-center justify-between mb-4">
        <div className="flex flex-col gap-1 pl-[34px]">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-bold uppercase tracking-widest text-gradient flex items-center gap-2">
              <Activity className="h-6 w-6" /> 
              {effectiveViewMode === "annual" ? "Evolução Anual" : "Saldo Mensal"}
            </h3>
          </div>
          
          {effectiveViewMode === "monthly" && !forcedViewMode && (
            <button 
              onClick={() => setViewMode("annual")}
              className="flex items-center gap-1 text-[10px] uppercase font-black tracking-widest text-accent hover:text-white transition-all w-fit"
            >
              <ChevronLeft className="h-3 w-3" /> Voltar ao Anual
            </button>
          )}
        </div>

        {/* Toggle Mensal / Anual */}
        {onDashboardModeChange && dashboardMode && (
          <div className="flex flex-col items-center gap-3 absolute left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-3">
              <button 
                disabled={!canShiftPrev}
                onClick={() => onMonthShift?.(dashboardMode === 'annual' ? -12 : -1)}
                className={`text-muted-foreground transition-all flex items-center gap-2 group ${!canShiftPrev ? 'opacity-20 cursor-not-allowed' : 'hover:text-white hover:scale-110'}`}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="text-[10px] font-black tracking-widest opacity-30 group-hover:opacity-100 transition-opacity uppercase hidden sm:inline">
                  {dashboardMode === 'annual' ? year - 1 : MONTHS_PT[(month + 11) % 12]}
                </span>
              </button>
              <span className="text-xl font-black tracking-[0.2em] uppercase text-muted-foreground opacity-90 min-w-[150px] text-center">
                {dashboardMode === 'annual' ? year : MONTHS_PT[month]}
              </span>
              <button 
                disabled={!canShiftNext}
                onClick={() => onMonthShift?.(dashboardMode === 'annual' ? 12 : 1)}
                className={`text-muted-foreground transition-all flex items-center gap-2 group ${!canShiftNext ? 'opacity-20 cursor-not-allowed' : 'hover:text-white hover:scale-110'}`}
              >
                <span className="text-[10px] font-black tracking-widest opacity-30 group-hover:opacity-100 transition-opacity uppercase hidden sm:inline">
                  {dashboardMode === 'annual' ? year + 1 : MONTHS_PT[(month + 1) % 12]}
                </span>
                <ChevronLeft className="h-4 w-4 rotate-180" />
              </button>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDashboardModeChange('monthly')}
                className={`btn-ghost-neon rounded-lg px-4 py-1 text-[10px] font-black uppercase tracking-widest transition-all ${
                  dashboardMode === 'monthly' ? 'glow brightness-125' : 'opacity-50'
                }`}
              >
                Mensal
              </button>
              <button
                onClick={() => onDashboardModeChange('annual')}
                className={`btn-ghost-neon rounded-lg px-4 py-1 text-[10px] font-black uppercase tracking-widest transition-all ${
                  dashboardMode === 'annual' ? 'glow brightness-125' : 'opacity-50'
                }`}
              >
                Anual
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-8 pr-[58px]">
          {effectiveViewMode === "annual" ? (
            <>
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
            </>
          ) : (
            <>
              {isCurrentMonth && (
                <div className="flex flex-col items-end">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">
                    Saldo até {currentDay} de {MONTHS_PT[month]}
                  </span>
                  <span className={`text-2xl font-black font-mono tracking-tighter ${saldoAteHoje >= 0 ? 'text-accent drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`}>
                    {fmtCurrency(saldoAteHoje)}
                  </span>
                </div>
              )}

              <div className={`flex flex-col items-end ${isCurrentMonth ? 'border-l border-white/10 pl-8' : ''}`}>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">
                  {isCurrentMonth || isFutureMonth ? "Projeção Mensal" : `Saldo Final ${MONTHS_PT[month]}`}
                </span>
                <span className={`text-2xl font-black font-mono tracking-tighter ${(isCurrentMonth || isFutureMonth ? projecaoMensal : saldoAteHoje) >= 0 ? 'text-accent drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`}>
                  {fmtCurrency(isCurrentMonth || isFutureMonth ? projecaoMensal : saldoAteHoje)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart 
            data={chartData} 
            margin={{ top: 20, right: 0, left: 0, bottom: 0 }}
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
              
              {/* Gradiente para preencher APENAS acima de zero (Verde) */}
              <linearGradient id="fillPositive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0.5} />
                <stop offset={`${gradientOffset * 100}%`} stopColor="oklch(0.8 0.16 150)" stopOpacity={0.5} />
                <stop offset={`${gradientOffset * 100}%`} stopColor="transparent" stopOpacity={0} />
                <stop offset="100%" stopColor="transparent" stopOpacity={0} />
              </linearGradient>

              {/* Gradiente para preencher APENAS abaixo de zero (Vermelho) */}
              <linearGradient id="fillNegative" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="transparent" stopOpacity={0} />
                <stop offset={`${gradientOffset * 100}%`} stopColor="transparent" stopOpacity={0} />
                <stop offset={`${gradientOffset * 100}%`} stopColor="oklch(0.7 0.2 30)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0.5} />
              </linearGradient>

              <linearGradient id="splitColorStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.8 0.16 150)" stopOpacity={1} />
                <stop offset={`${gradientOffset * 100}%`} stopColor="oklch(0.8 0.16 150)" stopOpacity={1} />
                <stop offset={`${gradientOffset * 100}%`} stopColor="oklch(0.7 0.2 30)" stopOpacity={1} />
                <stop offset="100%" stopColor="oklch(0.7 0.2 30)" stopOpacity={1} />
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
              padding={{ left: 0, right: 0 }}
              tickFormatter={(val) => effectiveViewMode === "annual" ? val.slice(0, 3) : val}
            />
            <YAxis
              yAxisId="left"
              width={58}
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
              width={58}
              domain={effectiveViewMode === "monthly" ? [dataMin, dataMax] : ['auto', 'auto']}
              stroke="oklch(0.7 0.04 235)"
              fontSize={11}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip 
              cursor={false} 
              content={<CustomTooltip isMonthly={effectiveViewMode === "monthly"} year={year} month={month} />} 
            />
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
            {/* Áreas de Preenchimento Técnicas (Usando Gradientes de Máscara) */}
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="saldo"
              stroke="none"
              fill="url(#fillPositive)"
              baseValue={dataMin}
              legendType="none"
              tooltipType="none"
              animationDuration={1000}
              hide={effectiveViewMode === "annual"}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="saldo"
              stroke="none"
              fill="url(#fillNegative)"
              baseValue={dataMax}
              legendType="none"
              tooltipType="none"
              animationDuration={1000}
              hide={effectiveViewMode === "annual"}
            />

            {/* Linha de Contorno Principal */}
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="saldo"
              stroke="url(#splitColorStroke)"
              strokeWidth={3}
              fill="none"
              name="Saldo Acumulado"
              animationDuration={1000}
              hide={effectiveViewMode === "annual"}
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
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
