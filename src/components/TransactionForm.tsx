import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Plus, TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtCurrency, MONTHS_PT } from "@/lib/finance-constants";

interface Props {
  onCreated: () => void;
  defaultMonth?: number;
  defaultYear?: number;
  onMonthShift?: (delta: number) => void;
  onMonthYearChange?: (month: number, year: number) => void;
}

export function TransactionForm({ onCreated, defaultMonth, defaultYear, onMonthShift, onMonthYearChange }: Props) {
  const { user, role } = useAuth();
  const [type, setType] = useState<"income" | "expense">("expense");
  const [nature, setNature] = useState<"fixed" | "variable" | "">("");
  
  // Estado para categorias do banco
  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [selectedParentId, setSelectedParentId] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  // Sincronizar data com o seletor global
  useEffect(() => {
    if (defaultMonth !== undefined && defaultYear !== undefined) {
      const d = new Date(defaultYear, defaultMonth, 1);
      const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      setDate(iso);
    }
  }, [defaultMonth, defaultYear]);

  // Fallback (Padrões caso o banco esteja vazio/não criado)
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
      // const { data: official } = await supabase.from("categories").select("*").order("name");
      const official: any[] = [];
      const { data: fromTxs } = await supabase.from("transactions").select("category, description, type");
      
      let merged: any[] = (official || []).map(c => ({ ...c, isTemporary: false }));
      
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
    
    const newCat = {
      id: tempId,
      name: upperName,
      type: type,
      parent_id: parentId || null,
      isTemporary: true
    };

    setDbCategories(prev => [...prev, newCat]);
    
    if (!parentId) {
      setSelectedParentId(tempId);
      setSubCategory("");
    } else {
      setSubCategory(upperName);
    }

    toast.success(parentId ? "Subcategoria pronta para uso!" : "Categoria pronta para uso!");
  };

  // Lógica de seleção (Usa DB se houver, senão Fallback)
  const currentParents = dbCategories.length > 0 
    ? dbCategories.filter(c => c.type === type && !c.parent_id)
    : fallbackParents.filter(c => c.type === type);

  const currentSubs = dbCategories.length > 0
    ? dbCategories.filter(c => c.parent_id === selectedParentId).map(c => c.name)
    : (fallbackSubs[selectedParentId] || []);

  // Regras de Auditoria (Antecipação e Adiantamento)
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selectedParentId) {
      toast.error("Selecione uma categoria");
      return;
    }

    const parent = dbCategories.find(c => c.id === selectedParentId) || fallbackParents.find(c => c.id === selectedParentId);
    const parentName = parent?.name || "";

    if (!nature) {
      toast.error("Selecione o tipo de lançamento (Fixa ou Variável)");
      return;
    }



    // Limpa a formatação brasileira para converter em número puro
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

  return (
    <form 
      onSubmit={submit} 
      className={`rounded-2xl p-3 flex flex-col justify-between transition-all duration-500 border-2 shadow-2xl ${ 
        type === "expense" 
          ? "bg-red-500/10 border-red-500/40 shadow-[inset_0_0_50px_rgba(239,68,68,0.15)]" 
          : "bg-cyan-500/10 border-cyan-500/40 shadow-[inset_0_0_50px_rgba(34,211,238,0.15)]"
      } backdrop-blur-md h-full`}
    >
      <p className="text-center text-[11px] uppercase tracking-[0.3em] text-muted-foreground opacity-70 font-black mb-1">Novo Lançamento</p>
      <h3 className="relative flex items-center justify-between uppercase w-full px-1">
        <div className="flex items-center gap-2 flex-1">
          <button 
            type="button" 
            onClick={() => onMonthShift?.(-1)}
            className="text-muted-foreground hover:text-white transition-all hover:scale-125"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {defaultMonth !== undefined && (
            <button
              type="button"
              onClick={() => onMonthShift?.(-1)}
              className="text-[10px] font-black tracking-[0.2em] opacity-25 hover:opacity-60 text-gradient transition-all cursor-pointer whitespace-nowrap"
            >
              {MONTHS_PT[(defaultMonth + 11) % 12]}
            </button>
          )}
        </div>

        {defaultMonth !== undefined && (
          <span className="absolute left-1/2 -translate-x-1/2 text-xl font-black tracking-[0.3em] text-gradient whitespace-nowrap">
            {MONTHS_PT[defaultMonth]}
          </span>
        )}

        <div className="flex items-center justify-end gap-2 flex-1">
          {defaultMonth !== undefined && (
            <button
              type="button"
              onClick={() => onMonthShift?.(1)}
              className="text-[10px] font-black tracking-[0.2em] opacity-25 hover:opacity-60 text-gradient transition-all cursor-pointer whitespace-nowrap"
            >
              {MONTHS_PT[(defaultMonth + 1) % 12]}
            </button>
          )}

          <button 
            type="button" 
            onClick={() => onMonthShift?.(1)}
            className="text-muted-foreground hover:text-white transition-all hover:scale-125"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </h3>


      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { setType("expense"); setSelectedParentId(""); setSubCategory(""); }}
          className={`flex items-center justify-center gap-2 rounded-lg py-2 text-[10px] font-black uppercase tracking-[0.2em] transition ${
            type === "expense" ? "bg-destructive/20 text-destructive border border-destructive/60 glow" : "border border-border/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingDown className="h-4 w-4" /> Despesa
        </button>
        <button
          type="button"
          onClick={() => { setType("income"); setSelectedParentId(""); setSubCategory(""); }}
          className={`flex items-center justify-center gap-2 rounded-lg py-2 text-[10px] font-black uppercase tracking-[0.2em] transition ${
            type === "income" ? "bg-accent/20 text-accent border border-accent/60 glow" : "border border-border/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingUp className="h-4 w-4" /> Receita
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-black ml-1">Categoria</span>
          <div className="flex gap-2">
            <select
              required
              value={selectedParentId}
              onChange={(e) => { setSelectedParentId(e.target.value); setSubCategory(""); }}
              className="input-futuristic flex-1 h-8 rounded-lg px-2 py-0 outline-none uppercase font-bold text-xs"
            >
              <option value="">SELECIONE...</option>
              {currentParents.map((c) => (
                <option key={c.id} value={c.id} className="bg-popover">{c.name}</option>
              ))}
            </select>
            {role === "admin" && (
              <button
                type="button"
                onClick={() => handleQuickAdd()}
                className="flex items-center justify-center p-1.5 rounded-lg border border-border/50 hover:border-accent/50 hover:bg-accent/10 transition text-accent"
                title="Nova Categoria Principal"
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
        <div className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-black ml-1">Subcategoria</span>
          <div className="flex gap-2">
            <select
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              disabled={!selectedParentId}
              className="input-futuristic flex-1 h-8 rounded-lg px-2 py-0 outline-none disabled:opacity-30 uppercase font-bold text-xs"
            >
              <option value="">SELECIONE...</option>
              {currentSubs.map((s) => (
                <option key={s} value={s} className="bg-popover">{s}</option>
              ))}
            </select>
            {role === "admin" && selectedParentId && (
              <button
                type="button"
                onClick={() => handleQuickAdd(selectedParentId)}
                className="flex items-center justify-center p-1.5 rounded-lg border border-border/50 hover:border-accent/50 hover:bg-accent/10 transition text-accent"
                title="Nova Subcategoria"
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-black ml-1">Tipo de Lançamento</span>
          <select
            required
            value={nature}
            onChange={(e) => setNature(e.target.value as "fixed" | "variable")}
            className="input-futuristic w-full h-8 rounded-lg px-2 py-0 outline-none font-bold uppercase text-xs"
          >
            <option value="" className="bg-popover">SELECIONE...</option>
            <option value="variable" className="bg-popover uppercase">VARIÁVEL</option>
            <option value="fixed" className="bg-popover uppercase">FIXA</option>
          </select>
        </div>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-black ml-1">Valor (R$)</span>
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
            className="input-futuristic w-full h-8 rounded-lg px-2 py-0 outline-none font-bold text-xs text-accent tracking-wider"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-black ml-1">Data</span>
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
            className="input-futuristic w-full h-8 rounded-lg px-2 py-0 outline-none font-bold text-xs"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-black ml-1">Descrição</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value.toUpperCase())}
            placeholder="DIGITE..."
            className="input-futuristic w-full h-8 rounded-lg px-2 py-0 outline-none uppercase font-bold tracking-wide text-xs"
          />
        </label>
      </div>

      <button
        disabled={busy}
        type="submit"
        className={`w-full rounded-lg px-6 py-2.5 text-xs font-black uppercase tracking-[0.3em] transition-all duration-300 shadow-lg disabled:opacity-50 border-2 ${ 
          type === "expense" 
            ? "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30 shadow-red-900/10 glow" 
            : "bg-accent/20 border-accent/60 text-accent hover:bg-accent/30 shadow-accent-900/10 glow"
        }`}
      >
        {busy ? "Registrando..." : "Registrar Lançamento"}
      </button>
    </form>
  );
}
