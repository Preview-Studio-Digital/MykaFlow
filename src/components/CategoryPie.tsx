import { PieChart, Pie, Cell, ResponsiveContainer, Sector } from "recharts";
import { useState, useMemo, useEffect } from "react";
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

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, className } = props;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        className={className}
        style={{ filter: `drop-shadow(0 0 12px ${fill}88)`, transition: "all 0.3s" }}
      />
    </g>
  );
};

export function CategoryPie({
  title,
  data,
  transactions,
  accent,
  type = "expense",
  alignTitle = "left",
  onAddClick,
  prevTotal,
  comparisonLabel,
}: {
  title: string;
  data: { name: string; value: number }[];
  transactions: TxRow[];
  accent: string;
  type?: "income" | "expense";
  alignTitle?: "left" | "right";
  onAddClick?: () => void;
  prevTotal?: number;
  comparisonLabel?: string;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setActiveIndex(null);
  }, [selectedCategory]);

  const COLORS = type === "income" ? INCOME_COLORS : EXPENSE_COLORS;
  const isIncome = type === "income";
  const total = data.reduce((a, b) => a + b.value, 0);

  const drillDownData = useMemo(() => {
    if (!selectedCategory) return [];

    const catTxs = transactions.filter((t) => {
      let cat = (t.category || "").trim().toUpperCase();
      if (cat === "ESTRUTURA EMPRESARIAL") cat = "ESTRUTURA";
      return cat === selectedCategory;
    });
    const nameMap = new Map<string, number>();

    catTxs.forEach((t) => {
      let txDesc = (t.description || "OUTROS").split(" - ")[0].trim().toUpperCase();
      if (txDesc.includes("TI -") || txDesc === "TI") txDesc = "TI - TECNOLOGIA DA INFORMAÇÃO";
      if (txDesc.includes("FROTA")) txDesc = "FROTA";
      if (txDesc.includes("TELEFONIA")) txDesc = "TELEFONIA";

      nameMap.set(txDesc, (nameMap.get(txDesc) ?? 0) + Number(t.amount));
    });

    return Array.from(nameMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [selectedCategory, transactions]);

  const currentData = selectedCategory ? drillDownData : data;
  const currentTotal = selectedCategory ? drillDownData.reduce((a, b) => a + b.value, 0) : total;

  if (!mounted) {
    return <div className="glass rounded-2xl h-full min-h-[260px] animate-pulse bg-white/5" />;
  }

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  const onPieLeave = () => {
    setActiveIndex(null);
  };

  return (
    <div className="glass rounded-2xl h-full min-h-[260px] relative overflow-hidden">
      {/* Header Area - Absolute to not affect vertical centering of the Pie */}
      <div
        className={`absolute top-4 left-4 right-4 z-20 flex items-start justify-between gap-4 pointer-events-none ${alignTitle === "right" ? "flex-row-reverse" : ""}`}
      >
        <div
          className={`flex flex-col flex-1 px-2 pointer-events-auto ${alignTitle === "right" ? "items-end text-right pr-6" : "items-start text-left"}`}
        >
          <h3
            className="text-lg font-black tracking-widest uppercase text-gradient leading-tight"
            style={{ color: accent }}
          >
            {selectedCategory ? `DETALHAMENTO ${selectedCategory}` : title}
          </h3>
          <p className="text-[10px] uppercase opacity-50 tracking-wider font-bold">
            {selectedCategory ? "DETALHAMENTO" : "CLIQUE NAS FATIAS PARA DETALHAR"}
          </p>

          {selectedCategory && (
            <div className="mt-2">
              <button
                onClick={() => setSelectedCategory(null)}
                className="rounded-lg px-3 py-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border transition-all hover:brightness-125"
                style={{
                  color: accent,
                  borderColor: `${accent}44`,
                  backgroundColor: `${accent}11`,
                }}
              >
                <ChevronLeft className="h-3 w-3" /> Voltar
              </button>
            </div>
          )}
        </div>

        <div
          className={`flex flex-col pointer-events-auto ${alignTitle === "right" ? "items-start" : "items-end"}`}
        >
          <div className={`group/comp flex flex-col mb-2 ${alignTitle === "right" ? "items-start" : "items-end"}`}>
            <div
              className="text-2xl font-black font-mono tracking-tighter cursor-help"
              style={{
                color: accent,
                textShadow: `0 0 10px ${accent}`,
              }}
            >
              {fmtCurrency(total)}
            </div>

            {prevTotal !== undefined && !selectedCategory && (
              <div
                className={`flex flex-col mb-1 transition-all duration-300 opacity-0 group-hover/comp:opacity-100 ${alignTitle === "right" ? "items-start text-left" : "items-end text-right"}`}
              >
                {(() => {
                  const diff = total - prevTotal;
                  const perc = prevTotal > 0 ? (diff / prevTotal) * 100 : 100;
                  const isGrowth = diff > 0;
                  const color =
                    type === "income"
                      ? isGrowth
                        ? "oklch(0.78 0.16 150)"
                        : "oklch(0.7 0.2 30)"
                      : isGrowth
                        ? "oklch(0.7 0.2 30)"
                        : "oklch(0.78 0.16 150)";

                  return (
                    <p
                      className="text-xs font-bold uppercase tracking-wider leading-tight"
                      style={{ color }}
                    >
                      {isGrowth ? "Aumento" : "Diminuição"} de {Math.abs(perc).toFixed(1)}%
                      <span className="opacity-50 block text-[10px] tracking-widest mt-0.5">
                        {comparisonLabel || "EM RELAÇÃO AO MÊS PASSADO"}
                      </span>
                    </p>
                  );
                })()}
              </div>
            )}
          </div>

          {!selectedCategory && onAddClick && (
            <button
              onClick={onAddClick}
              className="rounded-xl px-5 py-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] border-2 transition-all hover:brightness-125 hover:scale-105 active:scale-95"
              style={{
                color: accent,
                borderColor: `${accent}66`,
                backgroundColor: `${accent}15`,
                boxShadow: `0 0 15px ${accent}33`,
              }}
            >
              {type === "income" ? "+ NOVA RECEITA" : "+ NOVA DESPESA"}
            </button>
          )}
        </div>
      </div>

      {currentData.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Sem dados
        </div>
      ) : (
        <div className="h-full w-full flex items-center justify-center pt-8">
          {/* Custom Legend Side (Absolute to keep Pie centered) */}
          <div
            className={`absolute top-0 bottom-0 z-10 flex flex-col gap-3 min-w-[150px] max-w-[240px] justify-center pr-6 pl-6 pt-20 pb-10 custom-scrollbar ${
              alignTitle === "right"
                ? "right-0 items-end text-right"
                : "left-0 items-start text-left"
            }`}
            style={{ overflowY: "auto", overflowX: "visible" }}
          >
            {currentData.map((entry, index) => {
              const isSpecial =
                !selectedCategory && type === "income" && entry.name.toUpperCase() === "ANTECIPAÇÃO DE NOTAS";
              const percentageValue = currentTotal > 0 ? (entry.value / currentTotal) * 100 : 0;
              let pulseClass = "";
              if (isSpecial) {
                if (percentageValue <= 25) pulseClass = "animate-pulse-green";
                else if (percentageValue <= 50) pulseClass = "animate-pulse-yellow";
                else if (percentageValue <= 75) pulseClass = "animate-pulse-orange";
                else pulseClass = "animate-pulse-red";
              }

              return (
                <div
                  key={index}
                  className={`flex flex-col group transition-all hover:scale-105 px-2 py-1 rounded-lg relative ${
                    alignTitle === "right" ? "hover:origin-right" : "hover:origin-left"
                  } ${selectedCategory ? "cursor-default" : "cursor-pointer"}`}
                  style={{ overflow: "visible" }}
                  onClick={() => !selectedCategory && setSelectedCategory(entry.name)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  <div
                    className={`flex items-center gap-3 relative ${alignTitle === "right" ? "flex-row-reverse" : "flex-row"}`}
                    style={{ overflow: "visible" }}
                  >
                    <div
                      className={`w-2.5 h-2.5 rounded-full shrink-0 relative z-10 ${pulseClass}`}
                      style={{
                        backgroundColor: pulseClass ? undefined : COLORS[index % COLORS.length],
                      }}
                    />
                    <div
                      className={`flex flex-col ${alignTitle === "right" ? "items-end" : "items-start"}`}
                    >
                      <span
                        className={`text-[10px] font-black uppercase tracking-widest truncate text-white/70 group-hover:text-white ${isSpecial ? "text-white" : ""}`}
                      >
                        {entry.name}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Custom Tooltip that reacts to legend hover too */}
          {activeIndex !== null && (
            <div
              className={`absolute bottom-4 z-20 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                alignTitle === "right" ? "left-4" : "right-4"
              }`}
            >
              {(() => {
                const entry = currentData[activeIndex];
                if (!entry) return null;
                const isSpecial = type === "income" && entry.name && entry.name.toUpperCase() === "ANTECIPAÇÃO DE NOTAS";
                const percentageValue = currentTotal > 0 ? (entry.value / currentTotal) * 100 : 0;

                let color = COLORS[activeIndex % COLORS.length];
                let classification = "";
                if (isSpecial) {
                  if (percentageValue <= 25) {
                    color = "oklch(0.78 0.16 150)"; // Green
                    classification = "NÍVEL SEGURO";
                  } else if (percentageValue <= 50) {
                    color = "oklch(0.85 0.18 95)"; // Yellow
                    classification = "NÍVEL ALERTA";
                  } else if (percentageValue <= 75) {
                    color = "oklch(0.7 0.2 45)"; // Orange
                    classification = "NÍVEL CRÍTICO";
                  } else {
                    color = "oklch(0.6 0.22 25)"; // Red
                    classification = "NÍVEL INSOLVENTE";
                  }
                }

                const percentageStr =
                  currentTotal > 0 ? ((entry.value / currentTotal) * 100).toFixed(1) : "0.0";
                return (
                  <div
                    className="glass rounded-xl px-2.5 py-2 border shadow-2xl min-w-[145px]"
                    style={{
                      borderColor: `${color}44`,
                      backgroundColor: "oklch(0.15 0.05 255 / 0.9)",
                      backdropFilter: "blur(12px)",
                    }}
                  >
                    <p
                      className="text-[9px] uppercase tracking-[0.2em] mb-0.5 font-black opacity-80"
                      style={{ color: color }}
                    >
                      {entry.name}
                    </p>
                    <div className="flex flex-col gap-0">
                      <p className="text-lg font-bold leading-tight" style={{ color: color }}>
                        {fmtCurrency(entry.value)}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div className="flex items-center gap-1">
                          <p
                            className="text-[10px] font-black tracking-wider px-1 py-0.5 rounded bg-white/10"
                            style={{ color: color }}
                          >
                            {percentageStr}%
                          </p>
                          <span className="text-[8px] uppercase opacity-50 font-bold">total</span>
                        </div>
                        {isSpecial && (
                          <span
                            className="text-[8px] font-black tracking-wider uppercase animate-pulse shrink-0"
                            style={{ color: color }}
                          >
                            {classification}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={currentData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  stroke="oklch(0.16 0.04 255)"
                  activeIndex={activeIndex !== null ? activeIndex : undefined}
                  activeShape={renderActiveShape}
                  onMouseEnter={onPieEnter}
                  onMouseLeave={onPieLeave}
                  onClick={(entry) => !selectedCategory && setSelectedCategory(entry.name)}
                  style={{ cursor: selectedCategory ? "default" : "pointer", outline: "none" }}
                >
                  {currentData.map((entry, i) => {
                    const isSpecial = type === "income" && entry.name.toUpperCase() === "ANTECIPAÇÃO DE NOTAS";
                    const percentageValue =
                      currentTotal > 0 ? (entry.value / currentTotal) * 100 : 0;
                    let pulseClass = "";
                    if (isSpecial) {
                      if (percentageValue <= 25) pulseClass = "animate-pulse-green";
                      else if (percentageValue <= 50) pulseClass = "animate-pulse-yellow";
                      else if (percentageValue <= 75) pulseClass = "animate-pulse-orange";
                      else pulseClass = "animate-pulse-red";
                    }

                    return (
                      <Cell
                        key={i}
                        fill={pulseClass ? undefined : COLORS[i % COLORS.length]}
                        className={pulseClass}
                        // @ts-expect-error - Recharts doesn't strictly type extra props but Sector will receive them
                        pulseClass={pulseClass}
                      />
                    );
                  })}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
