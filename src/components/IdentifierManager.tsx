import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Search, Settings2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/finance-constants";

interface Props {
  expenseCats: string[];
  incomeCats: string[];
  onUpdated: () => void;
}

export function IdentifierManager({ expenseCats, incomeCats, onUpdated }: Props) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const defaults = type === "expense" ? new Set(EXPENSE_CATEGORIES) : new Set(INCOME_CATEGORIES);
  const currentList = type === "expense" ? expenseCats : incomeCats;
  
  const customOnes = currentList
    .filter((cat) => !defaults.has(cat))
    .filter((cat) => cat.toLowerCase().includes(search.toLowerCase()));

  async function removeIdentifier(id: string) {
    const typeLabel = type === "expense" ? "DESPESA" : "RECEITA";
    if (!confirm(`Deseja excluir permanentemente todos os lançamentos de ${typeLabel} que utilizam o identificador "${id}"?\nEsta ação não pode ser desfeita.`)) {
      return;
    }

    setBusy(id);
    try {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("type", type)
        .or(`category.eq."${id}",description.eq."${id}",description.eq."* ${id}"`);

      if (error) throw error;

      toast.success(`Identificador "${id}" (${typeLabel}) removido.`);
      onUpdated();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao remover identificador");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="btn-ghost-neon rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
          <Settings2 className="h-4 w-4" /> Gerenciar Identificadores
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md glass border-white/10 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-gradient uppercase tracking-widest font-bold">
            Gerenciar Identificadores
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex bg-white/5 p-1 rounded-xl gap-1">
            <button
              onClick={() => { setType("expense"); setSearch(""); }}
              className={`flex-1 py-2 text-[10px] uppercase tracking-widest font-bold rounded-lg transition ${
                type === "expense" ? "bg-destructive/20 text-destructive border border-destructive/40 shadow-lg" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Despesas
            </button>
            <button
              onClick={() => { setType("income"); setSearch(""); }}
              className={`flex-1 py-2 text-[10px] uppercase tracking-widest font-bold rounded-lg transition ${
                type === "income" ? "bg-accent/20 text-accent border border-accent/40 shadow-lg" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Receitas
            </button>
          </div>

          <p className="text-[10px] text-muted-foreground uppercase tracking-wider text-center">
            Excluir um identificador apagará TODOS os lançamentos de **{type === "expense" ? "DESPESA" : "RECEITA"}** vinculados.
          </p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder={`Buscar ${type === "expense" ? "despesa" : "receita"}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-futuristic w-full rounded-lg pl-10 pr-3 py-2 outline-none text-sm"
            />
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 scrollbar-thin">
            {customOnes.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground italic">
                Nenhum identificador personalizado encontrado.
              </p>
            ) : (
              customOnes.map((id) => (
                <div
                  key={id}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors"
                >
                  <span className="text-sm font-medium">{id}</span>
                  <button
                    disabled={busy !== null}
                    onClick={() => removeIdentifier(id)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                  >
                    {busy === id ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
