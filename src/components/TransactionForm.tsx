import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/finance-constants";
import { toast } from "sonner";
import { Plus, TrendingUp, TrendingDown, X, ChevronDown } from "lucide-react";

const STRUCTURE_SUB_CATEGORIES = [
  "SAAE - Água",
  "CPFL - Energia",
  "Contabilidade",
  "Advocacia",
  "TI - Tecnologia da Informação",
  "IPTU",
  "Telefonia",
];

interface Props {
  onCreated: () => void;
  fixedType?: "income" | "expense";
  initialData?: {
    id: string;
    category: string;
    amount: number;
    description: string | null;
    nature: "fixed" | "variable";
    occurred_on: string;
    isVirtual?: boolean;
  } | null;
  categories?: string[];
}

export function TransactionForm({
  onCreated,
  fixedType,
  initialData,
  categories = [],
}: Props) {
  const { user } = useAuth();
  const [type, setType] = useState<"income" | "expense">(fixedType || "expense");
  const [nature, setNature] = useState<"fixed" | "variable">("variable");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const [isNewCategory, setIsNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const [subCategory, setSubCategory] = useState("");
  const [isNewSubCategory, setIsNewSubCategory] = useState(false);
  const [newSubCategory, setNewSubCategory] = useState("");

  const showSubCategory = type === "expense" && category === "Estrutura Empresarial";

  const availableCategories = useMemo(() => {
    return Array.from(new Set(categories)).sort();
  }, [categories]);

  useEffect(() => {
    if (initialData) {
      const cat = initialData.category;
      if (availableCategories.includes(cat)) {
        setCategory(cat);
        setIsNewCategory(false);
      } else {
        setCategory("NEW");
        setNewCategory(cat);
        setIsNewCategory(true);
      }
      
      setAmount(
        initialData.amount.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
      setNature(initialData.nature);
      setDate(initialData.occurred_on);
      setDescription(initialData.description || "");
    } else {
      // Reset form if initialData becomes null
      setCategory("");
      setAmount("");
      setIsNewCategory(false);
      setNewCategory("");
      setNature("variable");
      setDate(new Date().toISOString().slice(0, 10));
      setDescription("");
    }
  }, [initialData, availableCategories]); // Only re-run when initialData itself changes

  const isExpense = type === "expense";
  const accentColor = isExpense ? "oklch(0.7 0.2 30)" : "oklch(0.8 0.16 150)";
  const bgColor = isExpense ? "rgba(239, 68, 68, 0.05)" : "rgba(34, 197, 94, 0.05)";

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawValue = e.target.value.replace(/\D/g, "");
    const numericValue = parseInt(rawValue, 10);

    if (isNaN(numericValue)) {
      setAmount("");
      return;
    }

    const formattedValue = (numericValue / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    setAmount(formattedValue);
  }



  function switchType(t: "income" | "expense") {
    if (fixedType) return;
    setType(t);
    setCategory("");
    setIsNewCategory(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const value = parseFloat(amount.replace(/\./g, "").replace(",", "."));
    if (isNaN(value) || value <= 0) {
      toast.error("Valor inválido");
      return;
    }
    
    let finalCategory = isNewCategory ? newCategory : category;
    if (!finalCategory || finalCategory === "NEW") {
      toast.error("Informe o identificador");
      return;
    }

    let finalDescription = description;
    if (showSubCategory) {
      const sub = isNewSubCategory ? newSubCategory : subCategory;
      if (!sub || sub === "NEW") {
        toast.error("Informe a sub-categoria");
        return;
      }
      finalDescription = `[${sub}] ${description}`.trim();
    }

    setBusy(true);

    const isEdit = initialData && !initialData.isVirtual;
    const payload = {
      user_id: user.id,
      type,
      nature,
      category: finalCategory,
      description: finalDescription || null,
      amount: value,
      occurred_on: date,
    };

    let result;
    if (isEdit) {
      result = await supabase.from("transactions").update(payload).eq("id", initialData.id);
    } else {
      result = await supabase.from("transactions").insert(payload);
    }

    setBusy(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    toast.success(isEdit ? "Atualizado com sucesso" : `${isExpense ? "Despesa" : "Receita"} registrada`);
    
    // Clear form
    setAmount("");
    setNewCategory("");
    setIsNewCategory(false);
    setCategory("");
    setDescription("");
    onCreated(); // This will also trigger setEditExpense(null) in parent
  }

  return (
    <form
      onSubmit={submit}
      className="glass rounded-2xl p-6 space-y-4 border-t-2 relative"
      style={{
        borderTopColor: accentColor,
        background: `linear-gradient(180deg, ${bgColor} 0%, transparent 100%)`,
      }}
    >
      <div className="flex items-center justify-between">
        <h3
          className="text-lg font-bold tracking-widest uppercase flex items-center gap-2"
          style={{ color: accentColor }}
        >
          {isExpense ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
          {initialData && !initialData.isVirtual ? "Editar" : isExpense ? "Lançar Despesa" : "Lançar Receita"}
        </h3>
      </div>

      {!fixedType && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => switchType("expense")}
            className={`flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold uppercase tracking-widest transition ${
              type === "expense"
                ? "bg-destructive/20 text-destructive border border-destructive/60 glow"
                : "border border-border/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingDown className="h-4 w-4" /> Despesa
          </button>
          <button
            type="button"
            onClick={() => switchType("income")}
            className={`flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold uppercase tracking-widest transition ${
              type === "income"
                ? "bg-accent/20 text-accent border border-accent/60 glow"
                : "border border-border/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="h-4 w-4" /> Receita
          </button>
        </div>
      )}

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
            Identificador
          </span>
          <select
            required
            value={category}
            onChange={(e) => {
              const val = e.target.value;
              setCategory(val);
              setIsNewCategory(val === "NEW");
            }}
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
          >
            <option value="" disabled>
              Selecione...
            </option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
            <option value="NEW" className="font-bold text-accent">
              + NOVO (CADASTRAR NOVO)
            </option>
          </select>
        </label>

        {isNewCategory && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-widest text-accent font-bold">
                Novo Identificador
              </span>
              <input
                required
                autoFocus
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Ex: Aluguel, Vendas, Internet..."
                className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none border-accent/50"
              />
            </label>
          </div>
        )}

        {showSubCategory && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-widest text-accent font-bold">
                Sub-categoria (Estrutura)
              </span>
              <select
                required
                value={subCategory}
                onChange={(e) => {
                  const val = e.target.value;
                  setSubCategory(val);
                  setIsNewSubCategory(val === "NEW");
                }}
                className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
              >
                <option value="">Selecione a sub-categoria...</option>
                {STRUCTURE_SUB_CATEGORIES.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
                <option value="NEW" className="font-bold text-accent">
                  + NOVO (CADASTRAR NOVO)
                </option>
              </select>
            </label>

            {isNewSubCategory && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-widest text-accent font-bold">
                    Nova Sub-categoria
                  </span>
                  <input
                    required
                    autoFocus
                    value={newSubCategory}
                    onChange={(e) => setNewSubCategory(e.target.value)}
                    placeholder="Ex: Condomínio, Manutenção..."
                    className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none border-accent/50"
                  />
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
            Natureza
          </span>
          <select
            value={nature}
            onChange={(e) => setNature(e.target.value as "fixed" | "variable")}
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
          >
            <option value="variable">
              Variável
            </option>
            <option value="fixed">
              Fixa
            </option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
            Data
          </span>
          <input
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
          />
        </label>
      </div>

      <div className="grid grid-cols-1">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
            Descrição (Observação)
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Nota fiscal, observações extras..."
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
          />
        </label>
      </div>

      <div className="grid grid-cols-1">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
            Valor (R$)
          </span>
          <input
            required
            inputMode="numeric"
            value={amount}
            onChange={handleAmountChange}
            placeholder="0,00"
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none font-mono text-center text-lg"
          />
        </label>
      </div>

      <button
        disabled={busy}
        type="submit"
        className="btn-futuristic w-full rounded-lg px-6 py-3 text-sm disabled:opacity-50 font-bold tracking-[0.2em]"
        style={{
          background: isExpense
            ? "linear-gradient(135deg, oklch(0.7 0.2 30), oklch(0.5 0.15 25))"
            : "linear-gradient(135deg, oklch(0.8 0.16 150), oklch(0.6 0.14 140))",
          color: "white",
        }}
      >
        {busy ? "PROCESSANDO..." : (initialData && !initialData.isVirtual) ? "SALVAR ALTERAÇÕES" : isExpense ? "REGISTRAR DESPESA" : "REGISTRAR RECEITA"}
      </button>
    </form>
  );
}
