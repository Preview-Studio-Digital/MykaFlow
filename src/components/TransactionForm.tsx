import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Plus, TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  onCreated: () => void;
}

export function TransactionForm({ onCreated }: Props) {
  const { user } = useAuth();
  const [type, setType] = useState<"income" | "expense">("expense");
  const [nature, setNature] = useState<"fixed" | "variable">("variable");
  
  // Estado para categorias do banco
  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [selectedParentId, setSelectedParentId] = useState("");
  const [subCategory, setSubCategory] = useState("");
  
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  // Fallback (Padrões caso o banco esteja vazio/não criado)
  const fallbackParents = [
    { id: "f1", name: "ESTRUTURA", type: "expense" },
    { id: "f2", name: "AGNALDO", type: "expense" },
    { id: "f3", name: "EQUIPE", type: "expense" },
    { id: "f4", name: "FORNECEDORES", type: "expense" }
  ];

  const fallbackSubs: Record<string, string[]> = {
    "f1": ["TI - TECNOLOGIA DE INFORMAÇÃO", "FROTA", "ADVOCACIA", "CONTABILIDADE", "TELEFONIA", "CPFL - ENERGIA", "SAAE - ÁGUA", "IPTU - COMÉRCIO"]
  };

  useEffect(() => {
    async function fetchCats() {
      try {
        const { data: official } = await supabase.from("categories").select("*").order("name");
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
    }
    fetchCats();
  }, [type]);

  // Lógica de seleção (Usa DB se houver, senão Fallback)
  const currentParents = dbCategories.length > 0 
    ? dbCategories.filter(c => c.type === type && !c.parent_id)
    : fallbackParents.filter(c => c.type === type);

  const currentSubs = dbCategories.length > 0
    ? dbCategories.filter(c => c.parent_id === selectedParentId).map(c => c.name)
    : (fallbackSubs[selectedParentId] || []);

  // Regra da Antecipação
  useEffect(() => {
    const parent = dbCategories.find(c => c.id === selectedParentId) || fallbackParents.find(c => c.id === selectedParentId);
    const isAntecipacao = parent?.name === "ANTECIPAÇÃO" || subCategory === "ANTECIPAÇÃO";
    
    if (isAntecipacao && !description.startsWith("NOTA FISCAL Nº: ")) {
      setDescription(prev => prev ? `NOTA FISCAL Nº: ${prev}` : "NOTA FISCAL Nº: ");
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
    const isAntecipacao = parentName === "ANTECIPAÇÃO" || subCategory === "ANTECIPAÇÃO";

    if (isAntecipacao && (!description || description.trim() === "NOTA FISCAL Nº:")) {
      toast.error("Para ANTECIPAÇÃO, insira o número da NOTA FISCAL.");
      return;
    }

    // Limpa a formatação brasileira para converter em número puro
    const value = parseFloat(amount.replace(/\./g, "").replace(",", "."));
    if (isNaN(value) || value <= 0) {
      toast.error("Insira um valor válido");
      return;
    }
    
    setBusy(true);
    

    let finalDescription = "";
    if (subCategory === "CUSTOM") {
      const customName = description.trim().toUpperCase();
      finalDescription = customName;
      
      // Auto-cadastrar a nova subcategoria para uso futuro
      if (customName && selectedParentId && !selectedParentId.startsWith("f")) {
        const alreadyExists = dbCategories.find(c => c.name === customName && c.parent_id === selectedParentId);
        if (!alreadyExists) {
          await supabase.from("categories").insert({
            name: customName,
            type: type,
            parent_id: selectedParentId,
            user_id: user.id
          });
        }
      }
    } else {
      finalDescription = subCategory;
      if (description) {
        finalDescription += ` - ${description.trim().toUpperCase()}`;
      }
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
    toast.success("Lançamento e nova subcategoria registrados!");
    setAmount("");
    setSubCategory("");
    setDescription("");
    setSelectedParentId("");
    onCreated();
  }

  return (
    <form onSubmit={submit} className="glass rounded-2xl p-6 space-y-4">
      <h3 className="text-lg font-bold tracking-widest text-gradient flex items-center gap-2">
        <Plus className="h-5 w-5" /> Novo Lançamento
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
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">Categoria</span>
          <select
            required
            value={selectedParentId}
            onChange={(e) => { setSelectedParentId(e.target.value); setSubCategory(""); }}
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
          >
            <option value="">SELECIONE...</option>
            {currentParents.map((c) => (
              <option key={c.id} value={c.id} className="bg-popover">{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">Subcategoria</span>
          <select
            value={subCategory}
            onChange={(e) => setSubCategory(e.target.value)}
            disabled={!selectedParentId}
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none disabled:opacity-30 uppercase font-bold"
          >
            <option value="">SELECIONE...</option>
            {currentSubs.map((s) => (
              <option key={s} value={s} className="bg-popover">{s}</option>
            ))}
            <option value="CUSTOM" className="bg-popover font-bold text-accent">+ OUTRO (DIGITAR)</option>
          </select>
        </label>
      </div>

      {subCategory === "CUSTOM" && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-widest text-accent font-black">Nome da Nova Subcategoria</span>
            <input
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value.toUpperCase())}
              placeholder="DIGITE O NOME PARA SALVAR..."
              className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none border-accent/30 font-bold uppercase"
            />
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">Tipo de Gasto</span>
          <select
            value={nature}
            onChange={(e) => setNature(e.target.value as "fixed" | "variable")}
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
          >
            <option value="variable" className="bg-popover">Variável</option>
            <option value="fixed" className="bg-popover">Fixa</option>
          </select>
        </label>
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
            value={subCategory === "CUSTOM" ? "" : description}
            disabled={subCategory === "CUSTOM"}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={subCategory === "CUSTOM" ? "NOME JÁ DEFINIDO ACIMA" : "Ex: Referente ao mês 05"}
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none disabled:opacity-30"
          />
        </label>
      </div>

      <button
        disabled={busy}
        type="submit"
        className="btn-futuristic w-full rounded-lg px-6 py-4 text-sm font-bold uppercase tracking-widest disabled:opacity-50"
      >
        {busy ? "Registrando..." : "Registrar Lançamento"}
      </button>
    </form>
  );
}
