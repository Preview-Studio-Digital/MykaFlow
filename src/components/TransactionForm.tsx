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
}

export function TransactionForm({ onCreated, defaultMonth, defaultYear, onMonthShift }: Props) {
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
    
    /*
    const { data, error } = await supabase.from("categories").insert({
      name: upperName,
      type: type,
      parent_id: parentId || null,
      user_id: user.id
    }).select().single();

    if (error) {
      toast.error("Erro ao cadastrar: " + error.message);
      return;
    }
    */
    toast.info("Criação manual desativada. Use categorias existentes.");

    toast.success("Categoria criada!");
    setRefreshTrigger(prev => prev + 1);
    if (!parentId) {
      // setSelectedParentId(data.id);
    } else {
      setSubCategory(upperName);
    }
  };

  // Lógica de seleção (Usa DB se houver, senão Fallback)
  const currentParents = dbCategories.length > 0 
    ? dbCategories.filter(c => c.type === type && !c.parent_id)
    : fallbackParents.filter(c => c.type === type);

  const currentSubs = dbCategories.length > 0
    ? dbCategories.filter(c => c.parent_id === selectedParentId).map(c => c.name)
    : (fallbackSubs[selectedParentId] || []);

  // Regras de Auditoria (Antecipação e Adiantamento)
  useEffect(() => {
    const parent = dbCategories.find(c => c.id === selectedParentId) || fallbackParents.find(c => c.id === selectedParentId);
    const parentName = parent?.name || "";
    
    // Só aplicamos a regra se não estivermos digitando um NOME de nova subcategoria,
    // ou se o ADIANTAMENTO for a categoria pai selecionada.
    const isAntecipacao = parentName.toUpperCase().includes("ANTECIPAÇÃO") || subCategory.toUpperCase().includes("ANTECIPAÇÃO");
    const isAdiantamento = parentName.toUpperCase().includes("ADIANTAMENTOS") || subCategory.toUpperCase().includes("ADIANTAMENTOS");
    const isManutencao = parentName.toUpperCase().includes("MANUTENÇÃO") || subCategory.toUpperCase().includes("MANUTENÇÃO");
    
    if (isAntecipacao && !description.startsWith("NOTA FISCAL Nº: ")) {
      setDescription(prev => prev.startsWith("NOTA FISCAL Nº: ") ? prev : "NOTA FISCAL Nº: " + prev.replace("NOTA FISCAL Nº: ", ""));
    } else if (isAdiantamento && !description.startsWith("NF - ")) {
      setDescription(prev => prev.startsWith("NF - ") ? prev : "NF - " + prev.replace("NF - ", ""));
    } else if (isManutencao && !description.startsWith("CLIENTE - ")) {
      setDescription(prev => prev.startsWith("CLIENTE - ") ? prev : "CLIENTE - " + prev.replace("CLIENTE - ", ""));
    }
  }, [selectedParentId, subCategory]);

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

    const upperParent = parentName.toUpperCase();
    const upperSub = subCategory.toUpperCase();
    const isAntecipacao = upperParent.includes("ANTECIPAÇÃO") || upperSub.includes("ANTECIPAÇÃO");
    const isAdiantamento = upperParent.includes("ADIANTAMENTOS") || upperSub.includes("ADIANTAMENTOS");
    const isManutencao = upperParent.includes("MANUTENÇÃO") || upperSub.includes("MANUTENÇÃO");

    if (isAntecipacao && (!description || description.trim() === "NOTA FISCAL Nº:")) {
      toast.error("Para ANTECIPAÇÃO, insira o número da NOTA FISCAL.");
      return;
    }
    
    if (isAdiantamento && (!description || description.trim() === "NF -")) {
      toast.error("Para ADIANTAMENTOS, insira o número da NF.");
      return;
    }

    if (isManutencao && (!description || description.trim() === "CLIENTE -")) {
      toast.error("Para MANUTENÇÃO, insira o nome do CLIENTE.");
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
      className={`rounded-2xl p-6 space-y-4 transition-all duration-500 border-2 shadow-2xl ${ 
        type === "expense" 
          ? "bg-red-500/10 border-red-500/40 shadow-[inset_0_0_50px_rgba(239,68,68,0.15)]" 
          : "bg-cyan-500/10 border-cyan-500/40 shadow-[inset_0_0_50px_rgba(34,211,238,0.15)]"
      } backdrop-blur-md`}
    >
      <h3 className="text-lg font-bold tracking-widest text-gradient flex items-center justify-center gap-6 uppercase">
        <button 
          type="button" 
          onClick={() => onMonthShift?.(-1)}
          className="text-muted-foreground hover:text-white transition-all hover:scale-125"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4" /> Lançamento - {defaultMonth !== undefined ? MONTHS_PT[defaultMonth] : ""}
        </div>

        <button 
          type="button" 
          onClick={() => onMonthShift?.(1)}
          className="text-muted-foreground hover:text-white transition-all hover:scale-125"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </h3>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { setType("expense"); setSelectedParentId(""); setSubCategory(""); }}
          className={`flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold uppercase tracking-widest transition ${
            type === "expense" ? "bg-destructive/20 text-destructive border border-destructive/60 glow" : "border border-border/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingDown className="h-4 w-4" /> Despesa
        </button>
        <button
          type="button"
          onClick={() => { setType("income"); setSelectedParentId(""); setSubCategory(""); }}
          className={`flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold uppercase tracking-widest transition ${
            type === "income" ? "bg-accent/20 text-accent border border-accent/60 glow" : "border border-border/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingUp className="h-4 w-4" /> Receita
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">Categoria</span>
          <div className="flex gap-2">
            <select
              required
              value={selectedParentId}
              onChange={(e) => { setSelectedParentId(e.target.value); setSubCategory(""); }}
              className="input-futuristic flex-1 rounded-lg px-3 py-2.5 outline-none"
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
                className="flex items-center justify-center p-2.5 rounded-lg border border-border/50 hover:border-accent/50 hover:bg-accent/10 transition text-accent"
                title="Nova Categoria Principal"
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
        <div className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">Subcategoria</span>
          <div className="flex gap-2">
            <select
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              disabled={!selectedParentId}
              className="input-futuristic flex-1 rounded-lg px-3 py-2.5 outline-none disabled:opacity-30 uppercase font-bold"
            >
              <option value="">SELECIONE...</option>
              {currentSubs.map((s) => (
                <option key={s} value={s} className="bg-popover">{s}</option>
              ))}
            </select>
            {role === "admin" && selectedParentId && !selectedParentId.startsWith("temp") && (
              <button
                type="button"
                onClick={() => handleQuickAdd(selectedParentId)}
                className="flex items-center justify-center p-2.5 rounded-lg border border-border/50 hover:border-accent/50 hover:bg-accent/10 transition text-accent"
                title="Nova Subcategoria"
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">Tipo de Lançamento</span>
          <select
            required
            value={nature}
            onChange={(e) => setNature(e.target.value as "fixed" | "variable")}
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none font-bold"
          >
            <option value="" className="bg-popover">SELECIONE...</option>
            <option value="variable" className="bg-popover uppercase">Variável</option>
            <option value="fixed" className="bg-popover uppercase">Fixa</option>
          </select>
        </div>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">Valor (R$)</span>
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
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none font-bold text-lg text-accent"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">Data</span>
          <input
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">Descrição</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Referente ao mês 05"
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
          />
        </label>
      </div>

      <button
        disabled={busy}
        type="submit"
        className={`w-full rounded-lg px-6 py-4 text-sm font-bold uppercase tracking-widest transition-all duration-300 shadow-lg disabled:opacity-50 border-2 ${ 
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
