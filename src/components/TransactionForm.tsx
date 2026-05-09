import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/finance-constants";
import { toast } from "sonner";
import { Plus, TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  onCreated: () => void;
}

export function TransactionForm({ onCreated }: Props) {
  const { user } = useAuth();
  const [type, setType] = useState<"income" | "expense">("expense");
  const [nature, setNature] = useState<"fixed" | "variable">("variable");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const cats = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  function switchType(t: "income" | "expense") {
    setType(t);
    setCategory(t === "expense" ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const value = parseFloat(amount.replace(",", "."));
    if (isNaN(value) || value < 0) {
      toast.error("Valor inválido");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      type,
      nature,
      category,
      description: description || null,
      amount: value,
      occurred_on: date,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Lançamento registrado");
    setAmount("");
    setDescription("");
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

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
            Categoria
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
          >
            {cats.map((c) => (
              <option key={c} value={c} className="bg-popover">
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
            Tipo
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
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
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

      <label className="block">
        <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
          Descrição (opcional)
        </span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: pagamento fornecedor X"
          className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
        />
      </label>

      <button
        disabled={busy}
        type="submit"
        className="btn-futuristic w-full rounded-lg px-6 py-3 text-sm disabled:opacity-50"
      >
        {busy ? "Registrando..." : "Registrar"}
      </button>
    </form>
  );
}
