import { Trash2, Edit2, CheckCircle2 } from "lucide-react";
import { fmtCurrency } from "@/lib/finance-constants";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TxRow {
  id: string;
  user_id: string;
  type: "income" | "expense";
  nature: "fixed" | "variable";
  category: string;
  description: string | null;
  amount: number;
  occurred_on: string;
  created_at: string;
  isVirtual?: boolean;
}

export function TransactionList({
  rows,
  onDeleted,
  onEdit,
}: {
  rows: TxRow[];
  onDeleted: () => void;
  onEdit: (row: TxRow) => void;
}) {
  async function remove(id: string) {
    if (id.startsWith("virtual-")) {
      toast.info("Sugestão removida (apenas visual)");
      onDeleted(); // Re-trigger load to refresh UI
      return;
    }
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
          <tr className="border-b border-border/50 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <th className="px-4 py-3">Data</th>
            <th className="px-4 py-3">Tipo</th>
            <th className="px-4 py-3">Categoria</th>
            <th className="px-4 py-3">Natureza</th>
            <th className="px-4 py-3">Descrição</th>
            <th className="px-4 py-3 text-right">Valor</th>
            <th className="px-2 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={`border-b border-border/30 transition-colors hover:bg-primary/5 ${
                r.isVirtual ? "opacity-60 bg-primary/5" : ""
              }`}
            >
              <td className="px-4 py-3 font-mono text-xs">
                {new Date(r.occurred_on + "T00:00:00").toLocaleDateString("pt-BR")}
              </td>
              <td className="px-4 py-3">
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
              <td className="px-4 py-3">{r.category}</td>
              <td className="px-4 py-3 text-xs uppercase text-muted-foreground">
                <div className="flex items-center gap-1">
                  {r.nature === "fixed" ? "Fixa" : "Variável"}
                  {r.isVirtual && <span className="text-[10px] text-accent font-bold">*</span>}
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{r.description || "—"}</td>
              <td
                className={`px-4 py-3 text-right font-mono font-bold ${
                  r.type === "income" ? "text-accent" : "text-destructive"
                }`}
              >
                {r.type === "income" ? "+" : "−"} {fmtCurrency(Number(r.amount))}
              </td>
              <td className="px-2 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onEdit(r)}
                    className="rounded p-2 text-muted-foreground transition hover:bg-primary/20 hover:text-primary"
                    title={r.isVirtual ? "Confirmar e Editar" : "Editar"}
                  >
                    {r.isVirtual ? <CheckCircle2 className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
