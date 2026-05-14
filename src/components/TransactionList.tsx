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
  title,
}: {
  rows: TxRow[];
  onDeleted: () => void;
  allProfiles?: any[];
  title?: string;
}) {
  const [editingTx, setEditingTx] = useState<TxRow | null>(null);

  // Filter States
  const [filterDay, setFilterDay] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSub, setFilterSub] = useState("");
  const [filterNature, setFilterNature] = useState("");
  const [filterUser, setFilterUser] = useState("");

  const filteredRows = rows.filter((r) => {
    const day = new Date(r.occurred_on + "T00:00:00").getDate().toString();
    const sub = (r.description || "").split(" - ")[0] || "";

    if (filterDay && day !== filterDay) return false;
    if (filterType && r.type !== filterType) return false;
    if (filterCategory && r.category !== filterCategory) return false;
    if (filterSub && sub !== filterSub) return false;
    if (filterNature && r.nature !== filterNature) return false;
    if (filterUser && r.user_id !== filterUser) return false;
    return true;
  });

  const uniqueDays = Array.from(
    new Set(rows.map((r) => new Date(r.occurred_on + "T00:00:00").getDate().toString())),
  ).sort((a, b) => Number(a) - Number(b));
  const uniqueCats = Array.from(new Set(rows.map((r) => r.category))).sort();
  const uniqueSubs = Array.from(
    new Set(rows.map((r) => (r.description || "").split(" - ")[0] || "")),
  )
    .filter(Boolean)
    .sort();
  const uniqueUsers = Array.from(new Set(rows.map((r) => r.user_id)));

  async function remove(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Excluído");
      onDeleted();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="glass rounded-2xl overflow-hidden">
        {title && (
          <div className="py-8 border-b border-white/5">
            <h2 className="text-xl font-black uppercase tracking-[0.25em] text-gradient text-center">
              {title}
            </h2>
          </div>
        )}

        {/* Filters Bar - Now inside the table container */}
        <div className="p-4 bg-white/[0.02] border-b border-white/5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground ml-1">
              Dia
            </span>
            <select
              value={filterDay}
              onChange={(e) => setFilterDay(e.target.value)}
              className="input-futuristic h-9 rounded-xl px-3 py-0 text-[10px] uppercase font-bold outline-none"
            >
              <option value="">TODOS</option>
              {uniqueDays.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground ml-1">
              Tipo
            </span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="input-futuristic h-9 rounded-xl px-3 py-0 text-[10px] uppercase font-bold outline-none"
            >
              <option value="">TODOS</option>
              <option value="income">RECEITA</option>
              <option value="expense">DESPESA</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground ml-1">
              Categoria
            </span>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="input-futuristic h-9 rounded-xl px-3 py-0 text-[10px] uppercase font-bold outline-none"
            >
              <option value="">TODAS</option>
              {uniqueCats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground ml-1">
              Subcategoria
            </span>
            <select
              value={filterSub}
              onChange={(e) => setFilterSub(e.target.value)}
              className="input-futuristic h-9 rounded-xl px-3 py-0 text-[10px] uppercase font-bold outline-none"
            >
              <option value="">TODAS</option>
              {uniqueSubs.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground ml-1">
              Natureza
            </span>
            <select
              value={filterNature}
              onChange={(e) => setFilterNature(e.target.value)}
              className="input-futuristic h-9 rounded-xl px-3 py-0 text-[10px] uppercase font-bold outline-none"
            >
              <option value="">TODAS</option>
              <option value="fixed">FIXA</option>
              <option value="variable">VARIÁVEL</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground ml-1">
              Autor
            </span>
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="input-futuristic h-9 rounded-xl px-3 py-0 text-[10px] uppercase font-bold outline-none"
            >
              <option value="">TODOS</option>
              {uniqueUsers.map((u) => {
                const p = allProfiles.find((ap) => ap.id === u);
                return (
                  <option key={u} value={u}>
                    {p?.display_name || p?.email || "DESCONHECIDO"}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground uppercase tracking-widest">
            Nenhum lançamento encontrado com estes filtros.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-[10px] uppercase tracking-widest text-muted-foreground bg-white/[0.01]">
                  <th className="px-4 py-4 text-center">Data</th>
                  <th className="px-4 py-4 text-center">Tipo</th>
                  <th className="px-4 py-4 text-center">Categoria</th>
                  <th className="px-4 py-4 text-center">Subcategoria</th>
                  <th className="px-4 py-4 text-center">Descrição</th>
                  <th className="px-4 py-4 text-center">Natureza</th>
                  <th className="px-4 py-4 text-center">Valor</th>
                  <th className="px-4 py-4 text-center">Autor</th>
                  <th className="px-2 py-4" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const parts = (r.description || "").split(" - ");
                  const sub = parts[0] || "—";
                  const desc = parts.slice(1).join(" - ") || "—";

                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border/30 transition-colors hover:bg-primary/5"
                    >
                      <td className="px-4 py-4 font-mono text-xs text-center">
                        {new Date(r.occurred_on + "T00:00:00").toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-widest font-bold ${
                            r.type === "income"
                              ? "bg-accent/20 text-accent"
                              : "bg-destructive/20 text-destructive"
                          }`}
                        >
                          {r.type === "income" ? "Receita" : "Despesa"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center font-bold">{r.category}</td>
                      <td className="px-4 py-4 text-muted-foreground text-center">{sub}</td>
                      <td className="px-4 py-4 text-muted-foreground italic text-xs text-center">
                        {desc}
                      </td>
                      <td className="px-4 py-4 text-[10px] uppercase tracking-widest text-muted-foreground/80 font-black text-center">
                        {r.nature === "fixed" ? "Fixa" : "Variável"}
                      </td>
                      <td
                        className={`px-4 py-4 text-center font-mono font-black text-base ${
                          r.type === "income" ? "text-accent" : "text-destructive"
                        }`}
                      >
                        {r.type === "income" ? "+" : "−"} {fmtCurrency(Number(r.amount))}
                      </td>
                      <td className="px-4 py-4 text-[10px] uppercase tracking-widest text-muted-foreground/80 font-black text-center">
                        {allProfiles.find((p) => p.id === r.user_id)?.display_name ||
                          allProfiles.find((p) => p.id === r.user_id)?.email ||
                          "AUTOR DESCONHECIDO"}
                      </td>
                      <td className="px-2 py-4">
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
          </div>
        )}
      </div>

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
