import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { type TxRow } from "./TransactionList";
import { toast } from "sonner";
import { X, Save, TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  transaction: TxRow;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function TransactionEditDialog({ transaction, isOpen, onClose, onUpdated }: Props) {
  const [type, setType] = useState<"income" | "expense">(transaction.type);
  const [nature, setNature] = useState<"fixed" | "variable">(transaction.nature);
  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [selectedParentId, setSelectedParentId] = useState("");
  const [subCategory, setSubCategory] = useState(transaction.description || "");
  const [note, setNote] = useState(""); 
  const [amount, setAmount] = useState(
    Number(transaction.amount).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
  const [date, setDate] = useState(transaction.occurred_on);
  const [busy, setBusy] = useState(false);

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
        const currentParent = merged.find(c => c.name === transaction.category && !c.parent_id);
        if (currentParent) setSelectedParentId(currentParent.id);
      } catch (err) { console.error(err); }
    }
    if (isOpen) fetchCats();
  }, [isOpen, transaction.category]);

  useEffect(() => {
    if (!selectedParentId && isOpen) {
      const parent = fallbackParents.find(p => p.name === transaction.category);
      if (parent) setSelectedParentId(parent.id);
    }
  }, [isOpen, transaction.category, dbCategories]);

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
    
    if (isAntecipacao && !note.startsWith("NOTA FISCAL Nº: ")) {
      setNote(prev => prev ? `NOTA FISCAL Nº: ${prev}` : "NOTA FISCAL Nº: ");
    }
  }, [selectedParentId, subCategory, isOpen]);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(amount.replace(/\./g, "").replace(",", "."));
    if (isNaN(value)) return toast.error("Valor inválido");

    const parent = dbCategories.find(c => c.id === selectedParentId) || fallbackParents.find(c => c.id === selectedParentId);
    const parentName = parent?.name || transaction.category;
    const isAntecipacao = parentName === "ANTECIPAÇÃO" || subCategory === "ANTECIPAÇÃO";

    if (isAntecipacao && (!note || note.trim() === "NOTA FISCAL Nº:")) {
      toast.error("Para ANTECIPAÇÃO, insira o número da NOTA FISCAL.");
      return;
    }

    setBusy(true);

    const { error } = await supabase
      .from("transactions")
      .update({
        type,
        nature,
        category: parentName,
        description: (note ? `${subCategory} - ${note}` : subCategory).toUpperCase(),
        amount: value,
        occurred_on: date,
      })
      .eq("id", transaction.id);

    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Atualizado");
      onUpdated();
      onClose();
    }
  }

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="glass w-full max-w-xl rounded-3xl p-8 shadow-2xl relative animate-in zoom-in duration-200 border border-white/20 max-h-[95vh] overflow-y-auto">
        <button onClick={onClose} className="absolute right-6 top-6 text-muted-foreground hover:text-white transition-colors z-10 p-2">
          <X className="h-6 w-6" />
        </button>

        <h3 className="text-2xl font-black tracking-[0.2em] text-gradient mb-8 flex items-center gap-3 uppercase">
          <Save className="h-6 w-6 text-accent" /> Editar Lançamento
        </h3>

        <form onSubmit={handleUpdate} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setType("expense")}
              className={`flex items-center justify-center gap-2 rounded-xl py-4 text-[10px] font-black uppercase tracking-widest transition-all ${
                type === "expense" ? "bg-destructive/20 text-destructive border border-destructive/60 shadow-[0_0_15px_rgba(239,68,68,0.3)]" : "border border-border/50 text-muted-foreground opacity-50 hover:opacity-100"
              }`}
            >
              <TrendingDown className="h-4 w-4" /> Despesa
            </button>
            <button
              type="button"
              onClick={() => setType("income")}
              className={`flex items-center justify-center gap-2 rounded-xl py-4 text-[10px] font-black uppercase tracking-widest transition-all ${
                type === "income" ? "bg-accent/20 text-accent border border-accent/60 shadow-[0_0_15px_rgba(34,211,238,0.3)]" : "border border-border/50 text-muted-foreground opacity-50 hover:opacity-100"
              }`}
            >
              <TrendingUp className="h-4 w-4" /> Receita
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-black ml-1">Categoria</span>
              <select
                required
                value={selectedParentId}
                onChange={(e) => { setSelectedParentId(e.target.value); setSubCategory(""); }}
                className="input-futuristic w-full rounded-xl px-4 py-3.5 text-sm outline-none uppercase font-bold"
              >
                <option value="">SELECIONE...</option>
                {currentParents.map((c) => (
                  <option key={c.id} value={c.id} className="bg-popover uppercase">{c.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-black ml-1">Subcategoria</span>
              {currentSubs.length > 0 ? (
                <select
                  value={subCategory}
                  onChange={(e) => setSubCategory(e.target.value.toUpperCase())}
                  className="input-futuristic w-full rounded-xl px-4 py-3.5 text-sm outline-none uppercase font-bold"
                >
                  <option value="">SELECIONE...</option>
                  {currentSubs.map((s) => (
                    <option key={s} value={s} className="bg-popover uppercase">{s}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={subCategory}
                  onChange={(e) => setSubCategory(e.target.value.toUpperCase())}
                  placeholder="ITEM..."
                  className="input-futuristic w-full rounded-xl px-4 py-3.5 text-sm outline-none uppercase font-bold"
                />
              )}
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-black ml-1">Tipo de Gasto</span>
              <select
                value={nature}
                onChange={(e) => setNature(e.target.value as "fixed" | "variable")}
                className="input-futuristic w-full rounded-xl px-4 py-3.5 text-sm outline-none uppercase font-bold"
              >
                <option value="variable" className="bg-popover uppercase">Variável</option>
                <option value="fixed" className="bg-popover uppercase">Fixa</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-black ml-1">Valor (R$)</span>
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
                className="input-futuristic w-full rounded-xl px-4 py-3.5 text-lg outline-none font-bold text-accent"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-black ml-1">Data</span>
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input-futuristic w-full rounded-xl px-4 py-3.5 text-sm outline-none font-bold"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-black ml-1">Descrição</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value.toUpperCase())}
                placeholder="DETALHES..."
                className="input-futuristic w-full rounded-xl px-4 py-3.5 text-sm outline-none uppercase font-bold"
              />
            </label>
          </div>

          <div className="flex gap-4 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-white/10 py-4 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white/5 transition-all"
            >
              Cancelar
            </button>
            <button
              disabled={busy}
              type="submit"
              className="flex-1 btn-futuristic rounded-2xl py-4 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-glow"
            >
              <Save className="h-4 w-4" /> {busy ? "Salvando..." : "Salvar Alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
