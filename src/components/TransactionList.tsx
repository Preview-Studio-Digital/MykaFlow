import { Trash2, Edit2 } from "lucide-react";
import { fmtCurrency } from "@/lib/finance-constants";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { TransactionEditDialog } from "./TransactionEditDialog";

export interface TxRow {
  id: string;
  user_id: string;
  type: "income" | "expense";
  nature: "fixed" | "variable";
  category: string;
  description: string | null;
  amount: number;
  occurred_on: string;
  profiles?: { display_name: string | null };
}

export function TransactionList({
  rows,
  onDeleted,
  allProfiles = [],
}: {
  rows: TxRow[];
  onDeleted: () => void;
  allProfiles?: any[];
}) {
  const [editingTx, setEditingTx] = useState<TxRow | null>(null);

  async function remove(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Excluído");
      onDeleted();
    }
  }

  if (rows.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
        Nenhum lançamento neste período.
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 text-[10px] uppercase tracking-widest text-muted-foreground">
            <th className="px-4 py-3 text-center">Data</th>
            <th className="px-4 py-3 text-center">Tipo</th>
            <th className="px-4 py-3 text-center">Categoria</th>
            <th className="px-4 py-3 text-center">Subcategoria</th>
            <th className="px-4 py-3 text-center">Descrição</th>
            <th className="px-4 py-3 text-center">Natureza</th>
            <th className="px-4 py-3 text-center">Valor</th>
            <th className="px-4 py-3 text-center">Autor</th>
            <th className="px-2 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const parts = (r.description || "").split(" - ");
            const sub = parts[0] || "—";
            const desc = parts.slice(1).join(" - ") || "—";

            return (
              <tr
                key={r.id}
                className="border-b border-border/30 transition-colors hover:bg-primary/5"
              >
                <td className="px-4 py-3 font-mono text-xs text-center">
                  {new Date(r.occurred_on + "T00:00:00").toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-widest ${
                      r.type === "income"
                        ? "bg-accent/20 text-accent"
                        : "bg-destructive/20 text-destructive"
                    }`}
                  >
                    {r.type === "income" ? "Receita" : "Despesa"}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">{r.category}</td>
                <td className="px-4 py-3 text-muted-foreground text-center">{sub}</td>
                <td className="px-4 py-3 text-muted-foreground italic text-xs text-center">{desc}</td>
                <td className="px-4 py-3 text-[10px] uppercase tracking-widest text-muted-foreground/80 font-black text-center">
                  {r.nature === "fixed" ? "Fixa" : "Variável"}
                </td>
                <td
                  className={`px-4 py-3 text-center font-mono font-bold ${
                    r.type === "income" ? "text-accent" : "text-destructive"
                  }`}
                >
                  {r.type === "income" ? "+" : "−"} {fmtCurrency(Number(r.amount))}
                </td>
                <td className="px-4 py-3 text-[10px] uppercase tracking-widest text-muted-foreground/80 font-black text-center">
                  {allProfiles.find(p => p.id === r.user_id)?.display_name || allProfiles.find(p => p.id === r.user_id)?.email || "AUTOR DESCONHECIDO"}
                </td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingTx(r)}
                      className="rounded p-2 text-muted-foreground transition hover:bg-accent/20 hover:text-accent"
                      title="Editar"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(r.id)}
                      className="rounded p-2 text-muted-foreground transition hover:bg-destructive/20 hover:text-destructive"
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editingTx && (
        <TransactionEditDialog 
          isOpen={!!editingTx}
          transaction={editingTx}
          onClose={() => setEditingTx(null)}
          onUpdated={onDeleted}
        />
      )}
    </div>
  );
}
