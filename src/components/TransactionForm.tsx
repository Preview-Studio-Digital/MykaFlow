import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/finance-constants";
import { toast } from "sonner";
import { Plus, TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  onCreated: () => void;
  fixedType?: "income" | "expense";
  initialData?: {
    category: string;
    amount: number;
    description: string | null;
    nature: "fixed" | "variable";
    occurred_on: string;
  } | null;
  suggestions?: string[];
  categories?: string[];
}

export function TransactionForm({
  onCreated,
  fixedType,
  initialData,
  suggestions = [],
  categories = [],
}: Props) {
  const { user } = useAuth();
  const [type, setType] = useState<"income" | "expense">(fixedType || "expense");
  const [nature, setNature] = useState<"fixed" | "variable">("variable");
  const [category, setCategory] = useState(
    fixedType === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]
  );
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const [isNewDescription, setIsNewDescription] = useState(false);
  const [newDescription, setNewDescription] = useState("");

  useEffect(() => {
    if (initialData) {
      setCategory(initialData.category);
      setAmount(
        initialData.amount.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
      const desc = (initialData.description || "").replace(/^\* /, "");
      if (suggestions.includes(desc)) {
        setDescription(desc);
        setIsNewDescription(false);
      } else if (desc) {
        setDescription("NEW");
        setNewDescription(desc);
        setIsNewDescription(true);
      } else {
        setDescription("");
        setIsNewDescription(false);
      }
      setNature(initialData.nature);
      setDate(initialData.occurred_on);
    }
  }, [initialData, suggestions]);

  const defaultCats = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
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
    setCategory(t === "expense" ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const value = parseFloat(amount.replace(/\./g, "").replace(",", "."));
    if (isNaN(value) || value <= 0) {
      toast.error("Valor inválido");
      return;
    }
    const finalDescription = isNewDescription ? newDescription : description;
    if (!finalDescription) {
      toast.error("Informe um nome");
      return;
    }

    setBusy(true);
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      type,
      nature,
      category,
      description: finalDescription || null,
      amount: value,
      occurred_on: date,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${isExpense ? "Despesa" : "Receita"} registrada`);
    setAmount("");
    setNewDescription("");
    setIsNewDescription(false);
    setDescription("");
    onCreated();
  }

  const catId = `categories-${fixedType || "all"}`;

  return (
    <form
      onSubmit={submit}
      className="glass rounded-2xl p-6 space-y-4 border-t-2"
      style={{
        borderTopColor: accentColor,
        background: `linear-gradient(180deg, ${bgColor} 0%, transparent 100%)`,
      }}
    >
      <h3
        className="text-lg font-bold tracking-widest uppercase flex items-center gap-2"
        style={{ color: accentColor }}
      >
        {isExpense ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
        {isExpense ? "Lançar Despesa" : "Lançar Receita"}
      </h3>

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
            Nome / Identificador
          </span>
          <select
            required
            value={description}
            onChange={(e) => {
              const val = e.target.value;
              setDescription(val);
              setIsNewDescription(val === "NEW");
            }}
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
          >
            <option value="" disabled>
              Selecione um nome...
            </option>
            {suggestions.map((s) => (
              <option key={s} value={s} className="bg-popover">
                {s}
              </option>
            ))}
            <option value="NEW" className="bg-popover font-bold text-accent">
              + NOVO (CADASTRAR NOVO)
            </option>
          </select>
        </label>

        {isNewDescription && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-widest text-accent font-bold">
                Novo Nome Específico
              </span>
              <input
                required
                autoFocus
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Digite o nome aqui..."
                className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none border-accent/50"
              />
            </label>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
            Categoria
          </span>
          <input
            required
            list={catId}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
            placeholder="Selecione ou digite..."
          />
          <datalist id={catId}>
            {defaultCats.map((c) => (
              <option key={c} value={c} />
            ))}
            {categories
              .filter((c) => !defaultCats.includes(c))
              .map((c) => (
                <option key={c} value={c} />
              ))}
          </datalist>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
            Natureza
          </span>
          <select
            value={nature}
            onChange={(e) => setNature(e.target.value as "fixed" | "variable")}
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
          >
            <option value="variable" className="bg-popover">
              Variável
            </option>
            <option value="fixed" className="bg-popover">
              Fixa
            </option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
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
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none font-mono"
          />
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
        {busy ? "REGISTRANDO..." : isExpense ? "REGISTRAR DESPESA" : "REGISTRAR RECEITA"}
      </button>
    </form>
  );
}
