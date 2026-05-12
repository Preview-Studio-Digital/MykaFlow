import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { MONTHS_PT } from "@/lib/finance-constants";

interface Props {
  onCreated: () => void;
  defaultMonth?: number;
  defaultYear?: number;
  onMonthShift?: (delta: number) => void;
  onMonthYearChange?: (month: number, year: number) => void;
  initialType?: "income" | "expense";
}

export function TransactionForm({ onCreated, defaultMonth, defaultYear, onMonthShift, onMonthYearChange, initialType }: Props) {
  const { user, role } = useAuth();
  const [type] = useState<"income" | "expense">(initialType || "expense");
  const [nature, setNature] = useState<"fixed" | "variable" | "">("");
  
  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [selectedParentId, setSelectedParentId] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [refreshTrigger] = useState(0);
  
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  // Sincronizar data ao navegar pelos meses (exceto no primeiro carregamento)
  useEffect(() => {
    if (isFirstLoad) {
      setIsFirstLoad(false);
      return;
    }
    if (defaultMonth !== undefined && defaultYear !== undefined) {
      const d = new Date(defaultYear, defaultMonth, 1);
      const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      setDate(iso);
    }
  }, [defaultMonth, defaultYear]);

  // Componente de Select Customizado para permitir estilização do hover (fill color)
  const CustomSelect = ({ 
    value, 
    onChange, 
    options, 
    placeholder, 
    disabled = false,
    label
  }: { 
    value: string, 
    onChange: (val: string) => void, 
    options: {id: string, name: string}[], 
    placeholder: string,
    disabled?: boolean,
    label: string
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const accentColor = type === 'expense' ? 'oklch(0.7 0.2 30)' : 'oklch(0.78 0.16 150)';
    const bgColor = type === 'expense' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 211, 238, 0.2)';
    
    const selectedName = options.find(o => o.id === value)?.name || placeholder;

    return (
      <div className="space-y-2 relative">
        <span className="block text-[11px] uppercase tracking-[0.3em] text-muted-foreground font-black ml-2">{label}</span>
        <div className="relative">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen(!isOpen)}
            className={`input-futuristic w-full h-14 rounded-2xl px-5 text-sm outline-none uppercase font-bold border-2 flex items-center justify-between transition-all ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:border-accent/40'}`}
            style={{ color: value ? 'white' : 'rgba(255,255,255,0.4)' }}
          >
            <span className="truncate">{selectedName}</span>
            <Plus className={`h-4 w-4 transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`} style={{ color: accentColor }} />
          </button>

          {isOpen && !disabled && (
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
              <ul className="absolute top-full left-0 right-0 mt-1 z-[101] bg-[#0d1117] border-2 border-white/10 rounded-xl overflow-hidden max-h-48 overflow-y-auto shadow-[0_10px_50px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-200">
                <li 
                  onClick={() => { onChange(""); setIsOpen(false); }}
                  className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors hover:text-white border-b border-white/5"
                  style={{ 
                    color: 'rgba(255,255,255,0.4)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = bgColor}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {placeholder}
                </li>
                {options.map((opt) => (
                  <li
                    key={opt.id}
                    onClick={() => { onChange(opt.id); setIsOpen(false); }}
                    className="px-4 py-2.5 text-xs font-bold uppercase cursor-pointer transition-colors hover:text-white border-b border-white/5 last:border-0"
                    style={{ 
                      backgroundColor: value === opt.id ? bgColor : 'transparent',
                      color: value === opt.id ? 'white' : 'rgba(255,255,255,0.9)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = bgColor}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = value === opt.id ? bgColor : 'transparent'}
                  >
                    {opt.name}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    );
  };

  const fallbackParents = [
    { id: "f1", name: "ESTRUTURA", type: "expense" },
    { id: "f2", name: "AGNALDO", type: "expense" },
    { id: "f3", name: "EQUIPE", type: "expense" },
    { id: "f4", name: "FORNECEDORES", type: "expense" },
    { id: "f5", name: "ANTECIPAÇÃO", type: "income" }
  ];

  const fallbackSubs: Record<string, string[]> = {
    "f1": ["TI - TECNOLOGIA DE INFORMAÇÃO", "FROTA", "ADVOCACIA", "CONTABILIDADE", "TELEFONIA", "CPFL - ENERGIA", "SAAE - ÁGUA", "IPTU - COMÉRCIO"]
  };

  const fetchCats = async () => {
    try {
      const { data: fromTxs } = await supabase.from("transactions").select("category, description, type");
      let merged: any[] = [];
      if (fromTxs) {
        fromTxs.forEach(t => {
          const catName = t.category.toUpperCase().trim();
          const txType = t.type;
          let parent = merged.find(m => m.name === catName && !m.parent_id);
          if (!parent) {
            const tempId = `temp-${catName}`;
            parent = { id: tempId, name: catName, type: txType, parent_id: null, isTemporary: true };
            merged.push(parent);
          }
          const subName = (t.description || "").split(" - ")[0].toUpperCase().trim();
          if (subName && !merged.find(m => m.name === subName && m.parent_id === parent?.id)) {
            merged.push({ id: `temp-sub-${subName}`, name: subName, type: txType, parent_id: parent?.id || null, isTemporary: true });
          }
        });
      }
      setDbCategories(merged);
    } catch (err) { 
      console.error(err);
      setDbCategories([]);
    }
  };

  useEffect(() => {
    fetchCats();
  }, [type, refreshTrigger]);

  const handleQuickAdd = async (parentId?: string) => {
    const name = prompt(parentId ? "Nome da nova Subcategoria:" : "Nome da nova Categoria Principal:");
    if (!name || !user) return;
    const upperName = name.trim().toUpperCase();
    const tempId = `temp-${Date.now()}`;
    const newCat = { id: tempId, name: upperName, type: type, parent_id: parentId || null, isTemporary: true };
    setDbCategories(prev => [...prev, newCat]);
    if (!parentId) {
      setSelectedParentId(tempId);
      setSubCategory("");
    } else {
      setSubCategory(upperName);
    }
    toast.success(parentId ? "Subcategoria pronta para uso!" : "Categoria pronta para uso!");
  };

  const currentParents = dbCategories.length > 0 
    ? dbCategories.filter(c => c.type === type && !c.parent_id)
    : fallbackParents.filter(c => c.type === type);

  const currentSubs = dbCategories.length > 0
    ? dbCategories.filter(c => c.parent_id === selectedParentId).map(c => c.name)
    : (fallbackSubs[selectedParentId] || []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selectedParentId) {
      toast.error("Selecione uma categoria");
      return;
    }
    const parent = dbCategories.find(c => c.id === selectedParentId) || fallbackParents.find(c => c.id === selectedParentId);
    const parentName = parent?.name || "";
    if (!nature) {
      toast.error("Selecione o tipo de lançamento");
      return;
    }
    const value = parseFloat(amount.replace(/\./g, "").replace(",", "."));
    if (isNaN(value) || value <= 0) {
      toast.error("Insira um valor válido");
      return;
    }
    setBusy(true);
    let finalDescription = subCategory;
    if (description) {
      finalDescription = subCategory ? `${subCategory} - ${description.trim().toUpperCase()}` : description.trim().toUpperCase();
    }
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      type,
      nature,
      category: parentName,
      description: finalDescription || null,
      amount: value,
      occurred_on: date,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Lançamento registrado!");
    setAmount("");
    setSubCategory("");
    setDescription("");
    setSelectedParentId("");
    onCreated();
  }

  // Estilo padronizado para todos os campos (Rajdhani)
  const fontStyle = "font-display";

  return (
    <form 
      onSubmit={submit} 
      className={`rounded-3xl p-8 flex flex-col transition-all duration-500 border-2 shadow-2xl ${fontStyle} ${ 
        type === "expense" 
          ? "bg-red-500/10 border-red-500/40 shadow-[inset_0_0_80px_rgba(239,68,68,0.1)]" 
          : "bg-cyan-500/10 border-cyan-500/40 shadow-[inset_0_0_80px_rgba(34,211,238,0.1)]"
      } backdrop-blur-xl gap-4`}
    >
      <div className="text-center mb-1">
        <h2 className={`text-2xl font-black tracking-[0.2em] uppercase ${type === 'expense' ? 'text-red-400' : 'text-accent'}`}>
          REGISTRO DE {type === 'expense' ? 'DESPESA' : 'RECEITA'}
        </h2>
        <div className={`h-1 w-32 mx-auto mt-2 opacity-50 ${type === 'expense' ? 'bg-red-500' : 'bg-accent'}`} />
      </div>

      <div className="relative flex items-center justify-between uppercase w-full px-4 mb-2">
        <div className="flex items-center gap-4 flex-1">
          <button 
            type="button" 
            onClick={() => onMonthShift?.(-1)}
            className="text-muted-foreground hover:text-white transition-all hover:scale-125 flex items-center gap-2 group"
          >
            <ChevronLeft className="h-5 w-5" />
            {defaultMonth !== undefined && (
              <span className="text-[10px] font-black tracking-widest opacity-30 group-hover:opacity-100 transition-opacity uppercase">
                {MONTHS_PT[(defaultMonth + 11) % 12]}
              </span>
            )}
          </button>
        </div>

        {defaultMonth !== undefined && (
          <span className="text-3xl font-black tracking-[0.3em] text-gradient whitespace-nowrap uppercase">
            {MONTHS_PT[defaultMonth]}
          </span>
        )}

        <div className="flex items-center justify-end gap-4 flex-1">
          <button 
            type="button" 
            onClick={() => onMonthShift?.(1)}
            className="text-muted-foreground hover:text-white transition-all hover:scale-125 flex items-center gap-2 group"
          >
            {defaultMonth !== undefined && (
              <span className="text-[10px] font-black tracking-widest opacity-30 group-hover:opacity-100 transition-opacity uppercase">
                {MONTHS_PT[(defaultMonth + 1) % 12]}
              </span>
            )}
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <CustomSelect
              label="Categoria"
              placeholder="SELECIONE..."
              value={selectedParentId}
              onChange={(val) => { setSelectedParentId(val); setSubCategory(""); }}
              options={currentParents}
            />
          </div>
          {role === "admin" && (
            <button
              type="button"
              onClick={() => handleQuickAdd()}
              className="flex items-center justify-center w-14 h-14 rounded-2xl border-2 border-border/50 hover:border-accent/50 hover:bg-accent/10 transition-all text-accent group mb-0"
              title="Nova Categoria"
            >
              <Plus className="h-6 w-6 group-hover:scale-125 transition-transform" />
            </button>
          )}
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <CustomSelect
              label="Subcategoria"
              placeholder="SELECIONE..."
              value={subCategory}
              onChange={(val) => setSubCategory(val)}
              options={currentSubs.map(s => ({id: s, name: s}))}
              disabled={!selectedParentId}
            />
          </div>
          {role === "admin" && selectedParentId && (
            <button
              type="button"
              onClick={() => handleQuickAdd(selectedParentId)}
              className="flex items-center justify-center w-14 h-14 rounded-2xl border-2 border-border/50 hover:border-accent/50 hover:bg-accent/10 transition-all text-accent group mb-0"
              title="Nova Subcategoria"
            >
              <Plus className="h-6 w-6 group-hover:scale-125 transition-transform" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <CustomSelect
          label="Fluxo de Caixa"
          placeholder="SELECIONE O TIPO..."
          value={nature}
          onChange={(val) => setNature(val as any)}
          options={[
            {id: 'variable', name: 'VARIÁVEL (EVENTUAL)'},
            {id: 'fixed', name: 'FIXO (RECORRENTE)'}
          ]}
        />
        <div className="space-y-2">
          <span className="block text-[11px] uppercase tracking-[0.3em] text-muted-foreground font-black ml-2">Valor do Lançamento</span>
          <div className="relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">R$</span>
            <input
              required
              inputMode="numeric"
              value={amount}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                const centered = (Number(val) / 100).toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                });
                setAmount(centered);
              }}
              placeholder="0,00"
              className="input-futuristic w-full h-14 rounded-2xl pl-12 pr-5 text-2xl outline-none font-black tracking-tighter border-2"
              style={{ color: type === 'expense' ? 'oklch(0.7 0.2 30)' : 'oklch(0.78 0.16 150)' }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <span className="block text-[11px] uppercase tracking-[0.3em] text-muted-foreground font-black ml-2">Data da Ocorrência</span>
          <input
            required
            type="date"
            value={date}
            onChange={(e) => {
              const newDate = e.target.value;
              setDate(newDate);
              if (newDate && onMonthYearChange) {
                const d = new Date(newDate + "T00:00:00");
                if (!isNaN(d.getTime())) {
                  onMonthYearChange(d.getMonth(), d.getFullYear());
                }
              }
            }}
            className="input-futuristic w-full h-14 rounded-2xl px-5 text-sm outline-none font-bold border-2"
          />
        </div>
        <div className="space-y-2">
          <span className="block text-[11px] uppercase tracking-[0.3em] text-muted-foreground font-black ml-2">Descrição</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value.toUpperCase())}
            placeholder="DIGITE INFORMAÇÕES ADICIONAIS..."
            className="input-futuristic w-full h-14 rounded-2xl px-5 text-sm outline-none uppercase font-bold tracking-wide border-2"
          />
        </div>
      </div>

      <button
        disabled={busy}
        type="submit"
        className={`w-full rounded-2xl py-6 text-sm font-black uppercase tracking-[0.4em] transition-all duration-500 disabled:opacity-50 border-2 mt-4 hover:scale-[1.02] active:scale-[0.98] ${ 
          type === "expense" 
            ? "bg-red-500/20 border-red-500/60 text-red-400 hover:bg-red-500/40" 
            : "bg-accent/20 border-accent/70 text-accent hover:bg-accent/40"
        }`}
        style={{ 
          boxShadow: type === 'expense' 
            ? '0 0 30px rgba(239, 68, 68, 0.3)' 
            : '0 0 30px rgba(34, 211, 238, 0.3)' 
        }}
      >
        {busy ? "Processando..." : `REGISTRAR ${type === 'expense' ? 'DESPESA' : 'RECEITA'}`}
      </button>
    </form>
  );
}
