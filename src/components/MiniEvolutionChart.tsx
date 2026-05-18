import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { fmtCurrency, MONTHS_PT } from "@/lib/finance-constants";
import { useMemo } from "react";

interface Tx {
  type: "income" | "expense";
  amount: number;
  occurred_on: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const saldo = payload[0].value;
    return (
      <div className="glass p-3 rounded-xl border border-white/10 backdrop-blur-md shadow-2xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1 text-muted-foreground">
          Dia {label}
        </p>
        <div
          className={`flex items-center gap-3 text-sm font-bold ${saldo >= 0 ? "text-accent" : "text-destructive"}`}
        >
          <span className="font-mono">{fmtCurrency(saldo)}</span>
        </div>
      </div>
    );
  }
  return null;
};

export function MiniEvolutionChart({
  data,
  year,
  month,
}: {
  data: Tx[];
  year: number;
  month: number;
}) {
  const dailyData = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => ({
      label: `${i + 1}`,
      receitas: 0,
      despesas: 0,
      day: i + 1,
      date: new Date(year, month, i + 1),
    }));

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
    const allDays = days.map((d) => {
      runningSaldo += d.receitas - d.despesas;
      return {
        ...d,
        saldo: runningSaldo,
      };
    });

    // Filtrar finais de semana (0 = Domingo, 6 = Sábado)
    return allDays.filter((d) => {
      const dayOfWeek = d.date.getDay();
      return dayOfWeek !== 0 && dayOfWeek !== 6;
    });
  }, [data, year, month]);

  const { gradientOffset, dataMin, dataMax, yTicks } = useMemo(() => {
    if (dailyData.length === 0) return { gradientOffset: 1, dataMin: 0, dataMax: 0, yTicks: undefined };
    const max = Math.max(...dailyData.map((d) => d.saldo), 0);
    const min = Math.min(...dailyData.map((d) => d.saldo), 0);

    const absMax = Math.max(Math.abs(min), Math.abs(max)) * 1.1 || 100;
    const step = absMax / 5;
    const ticks = [];
    let offset = 0.5;
    let dMin = 0;
    let dMax = absMax;

    if (min < 0) {
      for (let i = -5; i <= 5; i++) {
        ticks.push(step * i);
      }
      dMin = -absMax;
      dMax = absMax;
      offset = 0.5;
    } else {
      for (let i = 0; i <= 5; i++) {
        ticks.push(step * i);
      }
      dMin = 0;
      dMax = absMax;
      offset = 1;
    }

    return {
      gradientOffset: offset,
      dataMin: dMin,
      dataMax: dMax,
      yTicks: ticks,
    };
  }, [dailyData]);

  if (dailyData.length === 0) {
    return (
      <div className="glass rounded-2xl p-4 flex items-center justify-center h-[180px] text-xs text-muted-foreground uppercase tracking-widest">
        Sem dados
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-3 flex flex-col flex-1 min-h-[140px]">
      <h3 className="text-lg font-bold uppercase tracking-widest text-muted-foreground mb-4 text-center opacity-80">
        Evolução de {MONTHS_PT[month]}
      </h3>
      <div className="flex-1 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dailyData} margin={{ top: 10, right: 40, left: 40, bottom: 0 }}>
            <defs>
              <linearGradient id="miniSplitFill" x1="0" y1="0" x2="0" y2="1">
                {gradientOffset >= 1 ? (
                  <>
                    <stop offset="0%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0.1} />
                  </>
                ) : gradientOffset <= 0 ? (
                  <>
                    <stop offset="0%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0.1} />
                  </>
                ) : (
                  <>
                    <stop offset="0%" stopColor="oklch(0.8 0.16 150)" stopOpacity={0.4} />
                    <stop
                      offset={`${(gradientOffset * 100).toFixed(2)}%`}
                      stopColor="oklch(0.8 0.16 150)"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset={`${(gradientOffset * 100).toFixed(2)}%`}
                      stopColor="oklch(0.7 0.2 30)"
                      stopOpacity={0.4}
                    />
                    <stop offset="100%" stopColor="oklch(0.7 0.2 30)" stopOpacity={0.4} />
                  </>
                )}
              </linearGradient>
              <linearGradient id="miniSplitStroke" x1="0" y1="0" x2="0" y2="1">
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
                    <stop
                      offset={`${(gradientOffset * 100).toFixed(2)}%`}
                      stopColor="oklch(0.8 0.16 150)"
                      stopOpacity={1}
                    />
                    <stop
                      offset={`${(gradientOffset * 100).toFixed(2)}%`}
                      stopColor="oklch(0.7 0.2 30)"
                      stopOpacity={1}
                    />
                    <stop offset="100%" stopColor="oklch(0.7 0.2 30)" stopOpacity={1} />
                  </>
                )}
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="oklch(0.78 0.16 220 / 0.1)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              scale="point"
              stroke="oklch(0.7 0.04 235)"
              fontSize={10}
              axisLine={false}
              tickLine={false}
              padding={{ left: 0, right: 0 }}
            />
            <YAxis
              yAxisId="left"
              domain={[dataMin, dataMax]}
              ticks={yTicks}
              stroke="oklch(0.7 0.04 235)"
              fontSize={10}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              width={35}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[dataMin, dataMax]}
              ticks={yTicks}
              stroke="oklch(0.7 0.04 235)"
              fontSize={10}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              width={35}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip cursor={false} content={<CustomTooltip />} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="saldo"
              stroke="url(#miniSplitStroke)"
              strokeWidth={2}
              fill="url(#miniSplitFill)"
              animationDuration={1000}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="saldo"
              stroke="transparent"
              fill="transparent"
              legendType="none"
              tooltipType="none"
              animationDuration={0}
            />
            <ReferenceLine
              yAxisId="left"
              y={0}
              stroke="white"
              strokeWidth={1}
              strokeOpacity={0.5}
            />
            {dailyData.length > 0 && (
              <>
                <ReferenceLine
                  yAxisId="left"
                  y={dailyData[0].saldo}
                  stroke="oklch(0.78 0.16 220 / 0.4)"
                  strokeDasharray="2 2"
                  label={{
                    position: "insideLeft",
                    offset: 10,
                    value: `▶ ${Math.abs(dailyData[0].saldo) >= 1000 ? (dailyData[0].saldo / 1000).toFixed(1) + 'k' : dailyData[0].saldo.toFixed(0)}`,
                    fill: dailyData[0].saldo >= 0 ? "oklch(0.85 0.16 150)" : "oklch(0.7 0.2 30)",
                    fontSize: 10,
                    fontWeight: "900",
                  }}
                />
                <ReferenceLine
                  yAxisId="right"
                  y={dailyData[dailyData.length - 1].saldo}
                  stroke="oklch(0.78 0.16 220 / 0.4)"
                  strokeDasharray="2 2"
                  label={{
                    position: "insideRight",
                    offset: 10,
                    value: `${Math.abs(dailyData[dailyData.length - 1].saldo) >= 1000 ? (dailyData[dailyData.length - 1].saldo / 1000).toFixed(1) + 'k' : dailyData[dailyData.length - 1].saldo.toFixed(0)} ◀`,
                    fill: dailyData[dailyData.length - 1].saldo >= 0 ? "oklch(0.85 0.16 150)" : "oklch(0.7 0.2 30)",
                    fontSize: 10,
                    fontWeight: "900",
                  }}
                />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
