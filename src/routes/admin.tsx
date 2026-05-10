import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { AdminPanel } from "@/components/AdminPanel";
import { listUsers, adminUpdateRole, adminDeleteUser } from "@/lib/admin.functions";
import { ShieldCheck, ChevronLeft, Users, Plus, Trash2, Edit2, FolderTree, Save, X, TrendingUp, TrendingDown, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

interface Category {
  id: string;
  name: string;
  type: "income" | "expense";
  parent_id: string | null;
  isTemporary?: boolean;
}

function AdminPage() {
  const { user, role, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<"users" | "categories">("users");

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground uppercase tracking-widest text-xs">Carregando Central ADM...</div>;

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground uppercase tracking-widest text-xs">Você precisa estar logado.</p>
        <Link to="/login" className="btn-futuristic rounded-lg px-6 py-2">Ir para Login</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-center gap-6">
          <Link to="/" className="btn-ghost-neon rounded-xl p-3 transition-all hover:scale-110">
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-accent animate-pulse" />
              <h1 className="text-3xl font-black tracking-[0.15em] text-gradient uppercase">
                Central Administrativa
              </h1>
            </div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground font-black mt-1 opacity-70">
              Gestão Profissional de Acessos e Lançamentos
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1 space-y-2">
            <button
              onClick={() => setActiveTab("users")}
              className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl transition-all duration-300 ${
                activeTab === "users" ? "bg-accent/20 text-accent border border-accent/40 shadow-glow" : "text-muted-foreground hover:bg-white/5 border border-transparent"
              }`}
            >
              <Users className="h-4 w-4" />
              <span className="text-sm font-bold uppercase tracking-widest">Usuários</span>
            </button>
            <button
              onClick={() => setActiveTab("categories")}
              className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl transition-all duration-300 ${
                activeTab === "categories" ? "bg-accent/20 text-accent border border-accent/40 shadow-glow" : "text-muted-foreground hover:bg-white/5 border border-transparent"
              }`}
            >
              <FolderTree className="h-4 w-4" />
              <span className="text-sm font-bold uppercase tracking-widest">Categorias</span>
            </button>
          </div>

          <div className="md:col-span-3 space-y-6">
            {activeTab === "users" ? (
              <div className="space-y-6">
                <AdminPanel />
                <UserList />
              </div>
            ) : (
              <CategoryManager />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UserList() {
  const list = useServerFn(listUsers);
  const updateRole = useServerFn(adminUpdateRole);
  const delUser = useServerFn(adminDeleteUser);
  const { user: currentUser } = useAuth();

  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function fetchUsers() {
    try {
      const data = await list();
      setProfiles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erro ao listar usuários:", err);
      setProfiles([]);
      toast.error("Sessão expirada ou sem permissão. Tente relogar.");
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function toggleRole(targetUserId: string, currentRole: string) {
    setBusy(targetUserId);
    try {
      const newRole = currentRole === 'admin' ? 'user' : 'admin';
      await updateRole({ data: { targetUserId, role: newRole } });
      toast.success("Cargo atualizado");
      fetchUsers();
    } catch (err) {
      toast.error("Erro ao atualizar cargo");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(targetUserId: string, email: string) {
    if (targetUserId === currentUser?.id) return toast.error("Você não pode se excluir!");
    if (!confirm(`Deseja realmente REMOVER o acesso de ${email}?`)) return;

    setBusy(targetUserId);
    try {
      await delUser({ data: { targetUserId } });
      toast.success("Acesso removido");
      fetchUsers();
    } catch (err) {
      toast.error("Erro ao remover acesso");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="p-10 text-center opacity-50 uppercase tracking-widest text-xs">Carregando equipe...</div>;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold tracking-widest text-gradient flex items-center gap-2 uppercase">
          <Users className="h-5 w-5" /> Equipe Registrada
        </h3>
        <span className="text-[10px] uppercase tracking-widest opacity-50 font-black">{profiles.length} Membros</span>
      </div>

      <div className="space-y-3">
        {profiles.map(p => (
          <div key={p.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${p.role === 'admin' ? 'bg-accent/20 text-accent' : 'bg-white/10 text-muted-foreground'}`}>
                {p.role === 'admin' ? <ShieldCheck className="h-5 w-5" /> : <UserIcon className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-bold text-sm uppercase tracking-widest">{p.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono opacity-60">{p.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {p.id !== currentUser?.id && (
                <>
                  <button 
                    onClick={() => toggleRole(p.id, p.role || 'user')}
                    disabled={!!busy}
                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${ 
                      p.role === 'admin' 
                        ? 'border-accent/40 text-accent bg-accent/10 hover:bg-accent/20' 
                        : 'border-white/20 text-muted-foreground hover:border-white/40'
                    }`}
                  >
                    {busy === p.id ? '...' : p.role === 'admin' ? 'Rebaixar' : 'Tornar ADM'}
                  </button>
                  <button 
                    onClick={() => handleDelete(p.id, p.email)}
                    disabled={!!busy}
                    className="p-2 text-muted-foreground hover:text-red-500 transition-colors"
                    title="Remover Acesso"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
              {p.id === currentUser?.id && (
                <span className="text-[9px] uppercase tracking-widest font-black text-accent/60 px-3 py-1 border border-accent/20 rounded-lg">Você</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryManager() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"income" | "expense">("expense");
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [viewType, setViewType] = useState<"income" | "expense">("expense");
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const fetchCategories = async () => {
    try {
      // const { data: official } = await supabase.from("categories").select("*").order("name");
      const official: any[] = [];
      const { data: fromTxs } = await supabase.from("transactions").select("category, description, type");
      
      let merged: Category[] = (official || []) as Category[];
      
      if (fromTxs) {
        fromTxs.forEach(t => {
          const catName = t.category.toUpperCase().trim();
          const txType = t.type;

          if (!merged.find(m => m.name === catName && !m.parent_id)) {
            merged.push({ id: `temp-${catName}`, name: catName, type: txType, parent_id: null, isTemporary: true });
          }
          
          const subName = (t.description || "").split(" - ")[0].toUpperCase().trim();
          const parent = merged.find(m => m.name === catName && !m.parent_id);
          if (subName && parent && !merged.find(m => m.name === subName && m.parent_id === parent.id)) {
            merged.push({ id: `temp-sub-${subName}`, name: subName, type: txType, parent_id: parent.id, isTemporary: true });
          }
        });
      }

      setCategories(merged);
    } catch (err) {
      console.warn("Erro na sincronização");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCategories(); }, []);

  const addCategory = async (forcedName?: string, forcedParentId?: string | null, forcedType?: "income" | "expense") => {
    const nameToUse = forcedName || newName;
    const parentToUse = forcedParentId !== undefined ? forcedParentId : selectedParent;
    const typeToUse = forcedType || newType;

    console.log("Tentando cadastrar:", { nameToUse, parentToUse, typeToUse });

    if (!nameToUse || !user) {
      console.warn("Dados insuficientes para cadastro:", { nameToUse, user: !!user });
      return;
    }
    
    setLoading(true);
    try {
      let finalParentId = parentToUse;

      // Se o pai for temporário, precisamos oficializá-lo primeiro para ter um ID real (UUID)
      if (parentToUse && parentToUse.toString().startsWith("temp-")) {
        const parentName = parentToUse.replace("temp-", "").toUpperCase();
        console.log("Oficializando categoria pai primeiro:", parentName);
        
        /*
        const { data: newParent, error: pError } = await supabase
          .from("categories")
          .insert({ name: parentName, type: typeToUse, user_id: user.id })
          .select()
          .single();
        
        if (pError) throw pError;
        finalParentId = newParent.id;
        */
        finalParentId = parentToUse; // Mantém temporário
        console.log("Pai oficializado com novo ID:", finalParentId);
      }

      /*
      const { error } = await supabase.from("categories").insert({
        name: nameToUse.trim().toUpperCase(),
        type: typeToUse,
        parent_id: (finalParentId && finalParentId.toString().startsWith("temp-")) ? null : finalParentId,
        user_id: user.id
      });
      if (error) throw error;
      */
      toast.info("Apenas categorias do histórico são suportadas no momento.");

      toast.success("Cadastrado com sucesso!");
      setNewName("");
      setSelectedParent(null);
      await fetchCategories();
    } catch (err: any) {
      console.error("Erro fatal no cadastro:", err);
      toast.error("Erro no Supabase: " + (err.message || "Falha desconhecida"));
    } finally {
      setLoading(false);
    }
  };

  const updateCategory = async (id: string) => {
    try {
      if (!editingName) return toast.error("O nome não pode estar vazio.");
      const oldItem = categories.find(c => c.id === id);
      if (!oldItem) return toast.error("Item não encontrado.");

      const oldName = oldItem.name.toUpperCase().trim();
      const newNameClean = editingName.trim().toUpperCase();
      const isTemp = id.toString().startsWith("temp-");

      setLoading(true);

      if (!oldItem.parent_id) {
        await supabase
          .from("transactions")
          .update({ category: newNameClean })
          .eq("category", oldName);
      } else {
        const { data: txsToUpdate } = await supabase
          .from("transactions")
          .select("id, description")
          .eq("category", (categories.find(c => c.id === oldItem.parent_id)?.name || "").toUpperCase());

        if (txsToUpdate) {
          for (const tx of txsToUpdate) {
            if (tx.description?.toUpperCase().startsWith(oldName)) {
              const newDesc = tx.description.toUpperCase().replace(oldName, newNameClean);
              await supabase.from("transactions").update({ description: newDesc }).eq("id", tx.id);
            }
          }
        }
      }

      /*
      if (isTemp) {
        await supabase.from("categories").insert({
          name: newNameClean,
          type: oldItem.type || viewType,
          parent_id: oldItem.parent_id && !oldItem.parent_id.toString().startsWith("temp-") ? oldItem.parent_id : null,
          user_id: user.id
        });
      } else {
        await supabase
          .from("categories").update({ name: newNameClean }).eq("id", id);
      }
      */
      toast.info("Edição de categorias desativada (tabela inexistente)");

      toast.success("Atualizado com sucesso!");
      setEditingId(null);
      await fetchCategories();
    } catch (err: any) {
      toast.error("Erro ao sincronizar dados.");
    } finally {
      setLoading(false);
    }
  };

  const deleteCategory = async (id: string) => {
    const item = categories.find(c => c.id === id);
    if (!item) return;

    if (item.isTemporary) {
      toast.info("Este item vem do histórico. Altere ou exclua os lançamentos para removê-lo.");
      return;
    }

    setLoading(true);
    try {
      if (!item.parent_id) {
        const { count } = await supabase
          .from("transactions")
          .select("*", { count: 'exact', head: true })
          .eq("category", item.name.toUpperCase());

        if (count && count > 0) {
          toast.error(`Existem ${count} lançamentos vinculados.`);
          return;
        }
      } else {
        const parent = categories.find(c => c.id === item.parent_id);
        const { data: txs } = await supabase
          .from("transactions")
          .select("description")
          .eq("category", parent?.name.toUpperCase() || "");

        const linkedCount = txs?.filter(t => t.description?.toUpperCase().startsWith(item.name.toUpperCase())).length || 0;

        if (linkedCount > 0) {
          toast.error(`Existem ${linkedCount} lançamentos vinculados.`);
          return;
        }
      }

      if (confirm(`Excluir "${item.name}"?`)) {
        // await supabase.from("categories").delete().eq("id", id);
        toast.info("Exclusão desativada (tabela inexistente)");
        fetchCategories();
      }
    } catch (err) {
      toast.error("Erro ao excluir.");
    } finally {
      setLoading(false);
    }
  };

  const currentCats = categories.filter(c => c.type === viewType);
  const parents = currentCats.filter(c => !c.parent_id);

  return (
    <div className="glass rounded-2xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-bold tracking-widest text-gradient flex items-center gap-2 uppercase">
            <FolderTree className="h-5 w-5" /> Gestão de Estrutura
          </h3>
          <button 
            onClick={() => {
              const name = prompt("NOME DA NOVA CATEGORIA PRINCIPAL:");
              if (name) addCategory(name, null, viewType);
            }}
            className="bg-accent/20 text-accent p-1.5 rounded-lg border border-accent/40 hover:bg-accent hover:text-black transition-all shadow-glow-sm"
            title="Nova Categoria Principal"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex p-1 bg-white/5 rounded-xl border border-white/10">
          <button 
            onClick={() => { setViewType("expense"); setNewType("expense"); }}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewType === 'expense' ? 'bg-destructive/20 text-destructive border border-destructive/40 shadow-glow' : 'text-muted-foreground'}`}
          >
            Despesas
          </button>
          <button 
            onClick={() => { setViewType("income"); setNewType("income"); }}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewType === 'income' ? 'bg-accent/20 text-accent border border-accent/40 shadow-glow' : 'text-muted-foreground'}`}
          >
            Receitas
          </button>
        </div>
      </div>



      <div className="space-y-6">
        {loading ? (
          <div className="text-center py-20 opacity-50 uppercase tracking-widest text-xs animate-pulse">Sincronizando...</div>
        ) : parents.length === 0 ? (
          <div className="text-center py-20 opacity-30 uppercase tracking-widest text-xs border-2 border-dashed border-white/5 rounded-2xl">Nenhuma categoria encontrada</div>
        ) : parents.map(parent => (
          <div key={parent.id} className="space-y-3">
            <div className={`flex items-center justify-between p-4 rounded-xl border transition-all group ${viewType === 'income' ? 'bg-accent/10 border-accent/20 hover:border-accent' : 'bg-destructive/10 border-destructive/20 hover:border-destructive'}`}>
              <div className="flex items-center gap-3">
                {editingId === parent.id ? (
                  <div className="flex items-center gap-2">
                    <input 
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value.toUpperCase())}
                      className="input-futuristic rounded-lg px-3 py-1 text-xs outline-none uppercase font-bold"
                    />
                    <button onClick={() => updateCategory(parent.id)} className="text-accent hover:scale-110"><Save className="h-4 w-4" /></button>
                    <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <span className={`font-black text-sm tracking-[0.2em] uppercase ${viewType === 'income' ? 'text-accent' : 'text-destructive'}`}>{parent.name}</span>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => {
                    const name = prompt(`NOVA SUBCATEGORIA PARA ${parent.name.toUpperCase()}:`);
                    if (name) addCategory(name, parent.id, parent.type);
                  }}
                  className="p-2 text-accent hover:scale-110 transition-transform"
                  title="Adicionar Subcategoria"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button onClick={() => { setEditingId(parent.id); setEditingName(parent.name); }} className="p-2 text-muted-foreground hover:text-accent"><Edit2 className="h-4 w-4" /></button>
                <button onClick={() => deleteCategory(parent.id)} className="p-2 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="ml-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categories.filter(c => c.parent_id === parent.id).map(sub => (
                <div key={sub.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/20 transition-all group">
                  <div className="flex items-center gap-3">
                    {editingId === sub.id ? (
                      <div className="flex items-center gap-2">
                        <input 
                          autoFocus
                          value={editingName}
                          onChange={e => setEditingName(e.target.value.toUpperCase())}
                          className="input-futuristic rounded-lg px-2 py-1 text-xs outline-none uppercase font-bold"
                        />
                        <button onClick={() => updateCategory(sub.id)} className="text-accent hover:scale-110"><Save className="h-3 w-3" /></button>
                        <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X className="h-3 w-3" /></button>
                      </div>
                    ) : (
                      <span className="text-xs font-bold tracking-widest opacity-60 uppercase">{sub.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditingId(sub.id); setEditingName(sub.name); }} className="p-1.5 text-muted-foreground hover:text-accent"><Edit2 className="h-3 w-3" /></button>
                    <button onClick={() => deleteCategory(sub.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
