import { Trash2, Edit2 } from "lucide-react";
import { fmtCurrency } from "@/lib/finance-constants";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { TransactionEditDialog } from "./TransactionEditDialog";
import { stripLegacyClientFromFactoringDescription } from "@/lib/factoring-import-format";

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
  financial_subcategories?: { name: string | null } | null;
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
  const [showFilters, setShowFilters] = useState(false);
  const [filterDay, setFilterDay] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSub, setFilterSub] = useState("");
  const [filterNature, setFilterNature] = useState("");
  const [filterUser, setFilterUser] = useState("");

  // Sort State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const getSubcategoryName = (r: TxRow) =>
    r.financial_subcategories?.name || (r.description || "").split(" - ")[0] || "";
  const getDisplayDescription = (r: TxRow) => {
    const cleaned = (r.description || "").replace(" | VALIDAR VALOR", "").replace("VALIDAR VALOR", "").trim();
    if (cleaned.toUpperCase().includes("SYNC: NF")) {
      return stripLegacyClientFromFactoringDescription(cleaned, getSubcategoryName(r));
    }
    return cleaned.split(" - ").slice(1).join(" - ") || cleaned;
  };

  const filteredRows = rows.filter((r) => {
    const day = new Date(r.occurred_on + "T00:00:00").getDate().toString();
    const sub = getSubcategoryName(r);

    if (r.category === "VENCIMENTO ANTECIPAÇÃO") return false;
    if (filterDay && day !== filterDay) return false;
    if (filterType && r.type !== filterType) return false;
    if (filterCategory && r.category !== filterCategory) return false;
    if (filterSub && sub !== filterSub) return false;
    if (filterNature && r.nature !== filterNature) return false;
    if (filterUser && r.user_id !== filterUser) return false;
    return true;
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortConfig) return 0;
    
    const { key, direction } = sortConfig;
    let valA: any = a[key as keyof TxRow];
    let valB: any = b[key as keyof TxRow];

    if (key === "date") {
      valA = new Date(a.occurred_on + "T00:00:00").getTime();
      valB = new Date(b.occurred_on + "T00:00:00").getTime();
    } else if (key === "sub") {
      valA = getSubcategoryName(a);
      valB = getSubcategoryName(b);
    } else if (key === "desc") {
      valA = getDisplayDescription(a);
      valB = getDisplayDescription(b);
    } else if (key === "author") {
      valA = allProfiles.find((p) => p.id === a.user_id)?.display_name || allProfiles.find((p) => p.id === a.user_id)?.email || "";
      valB = allProfiles.find((p) => p.id === b.user_id)?.display_name || allProfiles.find((p) => p.id === b.user_id)?.email || "";
    } else if (key === "amount") {
      valA = Number(a.amount);
      valB = Number(b.amount);
    }

    if (valA < valB) return direction === "asc" ? -1 : 1;
    if (valA > valB) return direction === "asc" ? 1 : -1;
    return 0;
  });

  const requestSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return "";
    return sortConfig.direction === "asc" ? " ▲" : " ▼";
  };

  const uniqueDays = Array.from(
    new Set(rows.map((r) => new Date(r.occurred_on + "T00:00:00").getDate().toString())),
  ).sort((a, b) => Number(a) - Number(b));
  const uniqueCats = Array.from(new Set(rows.map((r) => r.category === "CUSTO OPERAÇÃO" ? "ANTECIPAÇÃO DE NOTAS" : r.category))).sort();
  const uniqueSubs = Array.from(
    new Set(rows.map((r) => getSubcategoryName(r))),
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
          <div className="py-6 border-b border-white/5 relative flex items-center justify-center">
            <h2 className="text-xl font-black uppercase tracking-[0.25em] text-gradient text-center">
              {title}
            </h2>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`absolute right-6 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border transition-all ${
                showFilters
                  ? "bg-accent/20 border-accent/50 text-accent"
                  : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
              }`}
            >
              {showFilters ? "Ocultar Filtros" : "Mostrar Filtros"}
            </button>
          </div>
        )}

        {showFilters && (
          <div className="p-4 bg-white/[0.02] border-b border-white/5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 animate-in fade-in slide-in-from-top-2">
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
        )}

        {sortedRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground uppercase tracking-widest">
            Nenhum lançamento encontrado com estes filtros.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-[10px] uppercase tracking-widest text-muted-foreground bg-white/[0.01]">
                  <th className="px-4 py-4 text-center cursor-pointer hover:text-white transition-colors" onClick={() => requestSort("date")}>
                    Data{getSortIcon("date")}
                  </th>
                  <th className="px-4 py-4 text-center cursor-pointer hover:text-white transition-colors" onClick={() => requestSort("type")}>
                    Tipo{getSortIcon("type")}
                  </th>
                  <th className="px-4 py-4 text-center cursor-pointer hover:text-white transition-colors" onClick={() => requestSort("category")}>
                    Categoria{getSortIcon("category")}
                  </th>
                  <th className="px-4 py-4 text-center cursor-pointer hover:text-white transition-colors" onClick={() => requestSort("sub")}>
                    Subcategoria{getSortIcon("sub")}
                  </th>
                  <th className="px-4 py-4 text-center cursor-pointer hover:text-white transition-colors" onClick={() => requestSort("desc")}>
                    Descrição{getSortIcon("desc")}
                  </th>
                  <th className="px-4 py-4 text-center cursor-pointer hover:text-white transition-colors" onClick={() => requestSort("nature")}>
                    Natureza{getSortIcon("nature")}
                  </th>
                  <th className="px-4 py-4 text-center cursor-pointer hover:text-white transition-colors" onClick={() => requestSort("amount")}>
                    Valor{getSortIcon("amount")}
                  </th>
                  <th className="px-4 py-4 text-center cursor-pointer hover:text-white transition-colors" onClick={() => requestSort("author")}>
                    Autor{getSortIcon("author")}
                  </th>
                  <th className="px-2 py-4" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => {
                  const hasValidar = r.description && r.description.includes("VALIDAR VALOR");
                  const rawDescCleaned = (r.description || "")
                    .replace(" | VALIDAR VALOR", "")
                    .replace("VALIDAR VALOR", "")
                    .trim();

                  const sub = getSubcategoryName(r) || "—";
                  const desc = getDisplayDescription(r) || "—";
                  const colorClass = r.type === "income" ? "text-accent" : "text-destructive";
                  const cellClass = `px-4 py-4 text-center text-sm font-sans font-semibold ${colorClass}`;

                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border/30 transition-colors hover:bg-primary/5"
                    >
                      <td className={cellClass}>
                        {new Date(r.occurred_on + "T00:00:00").toLocaleDateString("pt-BR")}
                      </td>
                      <td className={cellClass}>
                        {r.type === "income" ? "Receita" : "Despesa"}
                      </td>
                      <td className={cellClass}>{r.category === "CUSTO OPERAÇÃO" ? "ANTECIPAÇÃO DE NOTAS" : r.category}</td>
                      <td className={cellClass}>{sub}</td>
                      <td className={cellClass}>
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <span>{desc}</span>
                          {hasValidar && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.2)] animate-pulse">
                              Validar Valor
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={cellClass}>
                        {r.nature === "fixed" ? "Fixa" : "Variável"}
                      </td>
                      <td className={cellClass}>
                        {r.type === "income" ? "+" : "−"} {fmtCurrency(Number(r.amount))}
                      </td>
                      <td className={cellClass}>
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
