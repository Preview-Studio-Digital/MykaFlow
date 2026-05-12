import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend,
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
}: {
  title: string;
  data: { name: string; value: number }[];
  transactions: TxRow[];
  accent: string;
  type?: "income" | "expense";
  alignTitle?: "left" | "right";
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const COLORS = type === "income" ? INCOME_COLORS : EXPENSE_COLORS;
  const total = data.reduce((a, b) => a + b.value, 0);

  // Drill-down data: Group by transaction NAME for the selected category
  const drillDownData = useMemo(() => {
    if (!selectedCategory) return [];
    
    const catTxs = transactions.filter(t => {
      let cat = (t.category || "").trim().toUpperCase();
      if (cat === "ESTRUTURA EMPRESARIAL") cat = "ESTRUTURA";
      return cat === selectedCategory;
    });
    const nameMap = new Map<string, number>();
    
    catTxs.forEach(t => {
      // Pegamos apenas a primeira parte (subcategoria) antes do " - " para agrupar corretamente
      let txDesc = (t.description || "OUTROS").split(" - ")[0].trim().toUpperCase();
      
      // Unificação conforme solicitado pelo usuário
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
    <div className="glass rounded-2xl p-4 h-full min-h-[280px]">
      <div className={`mb-1 flex items-start justify-between ${alignTitle === 'right' ? 'flex-row-reverse' : ''}`}>
        <div className={`flex flex-col ${alignTitle === 'right' ? 'items-end' : 'items-start'}`}>
          <h3 className={`text-base font-bold tracking-widest uppercase h-6 overflow-hidden`} style={{ color: accent }}>
            {selectedCategory || title}
          </h3>
          <p className="text-[10px] uppercase opacity-50 tracking-wider h-4 overflow-hidden">
            {selectedCategory ? "Proporção dos Lançamentos" : "Clique em uma fatia para detalhar"}
          </p>
          <div className="h-8 flex items-center">
            {selectedCategory && (
              <button 
                onClick={() => setSelectedCategory(null)}
                className="rounded-lg px-4 py-1.5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border transition-all hover:brightness-125"
                style={{ color: accent, borderColor: `${accent}44`, backgroundColor: `${accent}11` }}
              >
                <ChevronLeft className="h-4 w-4" /> Voltar
              </button>
            )}
          </div>
        </div>
        
        <div 
          className="text-3xl font-black font-mono tracking-tighter" 
          style={{ 
            color: accent,
            textShadow: `0 0 12px ${accent}`
          }}
        >
          {fmtCurrency(total)}
        </div>
      </div>

      {currentData.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Sem dados neste período
        </div>
      ) : (
        <div className="h-[230px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 12, right: 15, bottom: 0, left: 15 }}>
              <Pie
                data={currentData}
                dataKey="value"
                nameKey="name"
                cy="42%"
                innerRadius={50}
                outerRadius={90}
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
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const { name, value, fill } = payload[0].payload;
                    const percentage = currentTotal > 0 ? ((value / currentTotal) * 100).toFixed(1) : "0.0";
                    return (
                      <div 
                        className="glass rounded-xl p-3 border shadow-2xl min-w-[140px]" 
                        style={{ 
                          borderColor: `${fill}44`,
                          backgroundColor: "oklch(0.15 0.05 255 / 0.9)",
                          backdropFilter: "blur(12px)"
                        }}
                      >
                        <p className="text-xs uppercase tracking-[0.2em] mb-2 font-black opacity-80" style={{ color: fill }}>
                          {name}
                        </p>
                        <div className="flex flex-col gap-1">
                          <p className="text-2xl font-bold leading-none" style={{ color: fill }}>
                            {fmtCurrency(value)}
                          </p>
                          <p className="text-sm font-bold uppercase tracking-widest mt-1" style={{ color: fill }}>
                            {percentage}% <span className="opacity-60 font-medium lowercase">do total</span>
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend 
                wrapperStyle={{ fontFamily: "Rajdhani", fontSize: 12, paddingTop: "16px", minHeight: "40px" }} 
                payload={selectedCategory ? [] : undefined}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
