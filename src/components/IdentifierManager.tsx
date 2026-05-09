import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Search, Settings2, Edit2, Check, X } from "lucide-react";

interface Props {
  expenseCats: string[];
  incomeCats: string[];
  onUpdated: () => void;
}

export function IdentifierManager({ expenseCats, incomeCats, onUpdated }: Props) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const currentList = type === "expense" ? expenseCats : incomeCats;
  
  const filteredOnes = currentList
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

      toast.success(`Lançamentos de "${id}" (${typeLabel}) removidos.`);
      onUpdated();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao remover identificador");
    } finally {
      setBusy(null);
    }
  }

  async function updateIdentifier(oldId: string) {
    const trimmedNew = newName.trim();
    if (!trimmedNew || trimmedNew === oldId) {
      setEditingId(null);
      return;
    }

    setBusy(oldId);
    try {
      const { error } = await supabase
        .from("transactions")
        .update({ category: trimmedNew })
        .eq("type", type)
        .eq("category", oldId);

      if (error) throw error;

      toast.success(`Identificador "${oldId}" renomeado para "${trimmedNew}" em todos os lançamentos.`);
      setEditingId(null);
      onUpdated();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao renomear identificador");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold tracking-widest text-gradient flex items-center gap-2">
          <Settings2 className="h-5 w-5" /> Gerenciar Identificadores
        </h3>
      </div>

      <div className="space-y-4">
        <div className="flex bg-white/5 p-1 rounded-xl gap-1">
          <button
            onClick={() => { setType("expense"); setSearch(""); setEditingId(null); }}
            className={`flex-1 py-2 text-[10px] uppercase tracking-widest font-bold rounded-lg transition ${
              type === "expense" ? "bg-destructive/20 text-destructive border border-destructive/40 shadow-lg" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Despesas
          </button>
          <button
            onClick={() => { setType("income"); setSearch(""); setEditingId(null); }}
            className={`flex-1 py-2 text-[10px] uppercase tracking-widest font-bold rounded-lg transition ${
              type === "income" ? "bg-accent/20 text-accent border border-accent/40 shadow-lg" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Receitas
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder={`Buscar ${type === "expense" ? "despesa" : "receita"}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-futuristic w-full rounded-lg pl-10 pr-3 py-2 outline-none text-sm"
          />
        </div>

        <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 scrollbar-thin">
          {filteredOnes.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground italic">
              Nenhum identificador encontrado.
            </p>
          ) : (
            filteredOnes.map((id) => {
              const isEditing = editingId === id;

              return (
                <div
                  key={id}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors"
                >
                  <div className="flex-1 flex items-center gap-2">
                    {isEditing ? (
                      <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="bg-deep/50 border border-accent/30 rounded px-2 py-1 text-sm outline-none w-full max-w-[200px]"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") updateIdentifier(id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                    ) : (
                      <span className="text-sm font-medium">{id}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => updateIdentifier(id)}
                          className="p-2 rounded-lg text-accent hover:bg-accent/10 transition"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-2 rounded-lg text-muted-foreground hover:bg-white/10 transition"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(id);
                            setNewName(id);
                          }}
                          className="p-2 rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10 transition"
                          title="Renomear"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          disabled={busy !== null}
                          onClick={() => removeIdentifier(id)}
                          className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                          title="Excluir lançamentos"
                        >
                          {busy === id ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
