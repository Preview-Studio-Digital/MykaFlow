import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Sector
} from "recharts";
import { useState, useMemo } from "react";
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
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;

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
        style={{ filter: `drop-shadow(0 0 12px ${fill}88)`, transition: 'all 0.3s' }}
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
  const COLORS = type === "income" ? INCOME_COLORS : EXPENSE_COLORS;
  const total = data.reduce((a, b) => a + b.value, 0);

  const drillDownData = useMemo(() => {
    if (!selectedCategory) return [];
    
    const catTxs = transactions.filter(t => {
      let cat = (t.category || "").trim().toUpperCase();
      if (cat === "ESTRUTURA EMPRESARIAL") cat = "ESTRUTURA";
      return cat === selectedCategory;
    });
    const nameMap = new Map<string, number>();
    
    catTxs.forEach(t => {
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

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  const onPieLeave = () => {
    setActiveIndex(null);
  };

  return (
    <div className="glass rounded-2xl h-full min-h-[260px] relative overflow-hidden">
      {/* Header Area - Absolute to not affect vertical centering of the Pie */}
      <div className={`absolute top-4 left-4 right-4 z-20 flex items-start justify-between gap-4 ${alignTitle === 'right' ? 'flex-row-reverse' : ''}`}>
        <div className={`flex flex-col flex-1 px-2 ${alignTitle === 'right' ? 'items-end text-right pr-6' : 'items-start text-left'}`}>
          <h3 className="text-lg font-black tracking-widest uppercase text-gradient leading-tight" style={{ color: accent }}>
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
                style={{ color: accent, borderColor: `${accent}44`, backgroundColor: `${accent}11` }}
              >
                <ChevronLeft className="h-3 w-3" /> Voltar
              </button>
            </div>
          )}
        </div>
        
        <div className={`flex flex-col ${alignTitle === 'right' ? 'items-start' : 'items-end'}`}>
          <div className="group/comp flex flex-col items-inherit">
            <div 
              className="text-2xl font-black font-mono tracking-tighter cursor-help" 
              style={{ 
                color: accent,
                textShadow: `0 0 10px ${accent}`
              }}
            >
              {fmtCurrency(total)}
            </div>

            {prevTotal !== undefined && !selectedCategory && (
              <div className={`flex flex-col mb-1 transition-all duration-300 opacity-0 group-hover/comp:opacity-100 ${alignTitle === 'right' ? 'items-start text-left' : 'items-end text-right'}`}>
                {(() => {
                  const diff = total - prevTotal;
                  const perc = prevTotal > 0 ? (diff / prevTotal) * 100 : 100;
                  const isGrowth = diff > 0;
                  const color = type === 'income' 
                    ? (isGrowth ? 'oklch(0.78 0.16 150)' : 'oklch(0.7 0.2 30)') 
                    : (isGrowth ? 'oklch(0.7 0.2 30)' : 'oklch(0.78 0.16 150)');

                  return (
                    <p className="text-xs font-bold uppercase tracking-wider leading-tight" style={{ color }}>
                      {isGrowth ? 'Aumento' : 'Diminuição'} de {Math.abs(perc).toFixed(1)}% 
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
              {type === 'income' ? '+ NOVA RECEITA' : '+ NOVA DESPESA'}
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
          {!selectedCategory && (
            <div 
              className={`absolute top-0 bottom-0 z-10 flex flex-col gap-3 min-w-[150px] max-w-[220px] justify-center overflow-y-auto pr-4 custom-scrollbar ${
                alignTitle === 'right' ? 'right-4 items-end text-right' : 'left-4 items-start text-left'
              }`}
            >
              {currentData.map((entry, index) => (
                <div 
                  key={index} 
                  className={`flex flex-col group cursor-pointer transition-all hover:scale-105 px-2 py-1 rounded-lg ${
                    alignTitle === 'right' ? 'hover:origin-right' : 'hover:origin-left'
                  }`}
                  onClick={() => setSelectedCategory(entry.name)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  <div className={`flex items-center gap-3 ${alignTitle === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-xs font-black uppercase tracking-widest truncate text-white/70 group-hover:text-white">
                      {entry.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Custom Tooltip that reacts to legend hover too */}
          {activeIndex !== null && (
            <div 
              className={`absolute bottom-4 z-20 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                alignTitle === 'right' ? 'left-4' : 'right-4'
              }`}
            >
              {(() => {
                const entry = currentData[activeIndex];
                const color = COLORS[activeIndex % COLORS.length];
                const percentage = currentTotal > 0 ? ((entry.value / currentTotal) * 100).toFixed(1) : "0.0";
                return (
                  <div 
                    className="glass rounded-xl p-3 border shadow-2xl min-w-[140px]" 
                    style={{ 
                      borderColor: `${color}44`,
                      backgroundColor: "oklch(0.15 0.05 255 / 0.9)",
                      backdropFilter: "blur(12px)"
                    }}
                  >
                    <p className="text-xs uppercase tracking-[0.2em] mb-2 font-black opacity-80" style={{ color: color }}>
                      {entry.name}
                    </p>
                    <div className="flex flex-col gap-1">
                      <p className="text-2xl font-bold leading-none" style={{ color: color }}>
                        {fmtCurrency(entry.value)}
                      </p>
                      <p className="text-sm font-bold uppercase tracking-widest mt-1" style={{ color: color }}>
                        {percentage}% <span className="opacity-60 font-medium lowercase">do total</span>
                      </p>
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
                  style={{ cursor: selectedCategory ? 'default' : 'pointer', outline: 'none' }}
                >
                  {currentData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
