import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { AdminPanel } from "@/components/AdminPanel";
import {
  ShieldCheck,
  ChevronLeft,
  Users,
  Plus,
  Trash2,
  Edit2,
  FolderTree,
  Save,
  X,
  TrendingUp,
  TrendingDown,
  User as UserIcon,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { IntegrationManager } from "@/components/IntegrationManager";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

interface Category {
  id: string;
  name: string;
  type: "income" | "expense";
  parent_id?: string | null;
  isTemporary?: boolean;
}

function AdminPage() {
  const { user, role, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"users" | "categories" | "integration">("users");

  const [profiles, setProfiles] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  async function fetchUsers() {
    setUsersLoading(true);
    try {
      const { data: profs, error: pErr } = await supabase.from("profiles").select("*");
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase.from("user_roles").select("*");

      const merged = (profs || []).map((p) => ({
        id: p.id,
        email: p.email,
        name: p.display_name || "Sem nome",
        role: roles?.find((r) => r.user_id === p.id)?.role || "user",
      }));

      setProfiles(merged);
    } catch (err: any) {
      console.error("Erro ao listar usuários:", err);
      toast.error(`Erro na lista: ${err.message || "Falha de conexão"}`);
      setProfiles([]);
    } finally {
      setUsersLoading(false);
    }
  }

  const isAdmin = role === "admin";

  useEffect(() => {
    if (user && activeTab === "users") {
      fetchUsers();
    }
  }, [user, activeTab]);

  if (authLoading)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground uppercase tracking-widest text-xs text-center">
        Carregando Central ADM...
      </div>
    );

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-center">
        <ShieldCheck className="h-16 w-16 text-muted-foreground opacity-20" />
        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-widest text-gradient uppercase">
            Acesso Restrito
          </h1>
          <p className="max-w-xs text-sm text-muted-foreground">
            Você precisa estar logado como administrador para acessar esta área.
          </p>
        </div>
        <Link
          to="/login"
          className="btn-futuristic rounded-xl px-8 py-3 text-xs font-bold uppercase tracking-widest"
        >
          Ir para Login
        </Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-center">
        <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20 pulse-glow">
          <ShieldCheck className="h-12 w-12 text-red-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-widest text-red-500 uppercase">
            ACESSO NEGADO
          </h1>
          <p className="max-w-xs text-sm text-muted-foreground">
            Seu usuário ({user.email}) não tem permissões de administrador.
          </p>
        </div>
        <Link
          to="/"
          className="btn-ghost-neon rounded-xl px-8 py-3 text-xs font-bold uppercase tracking-widest"
        >
          Voltar ao Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="relative z-10 min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="group flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 border border-white/10 transition-all hover:bg-primary/20 hover:border-primary/30"
            >
              <ChevronLeft className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-white" />
            </Link>
            <div>
              <h1 className="text-4xl font-black tracking-widest text-gradient uppercase leading-none mb-1">
                Central ADM
              </h1>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-black opacity-60">
                Gestão de Equipe e Configurações
              </p>
            </div>
          </div>

          <nav className="flex gap-2 p-1 rounded-2xl bg-white/5 border border-white/10">
            <button
              onClick={() => setActiveTab("users")}
              className={`flex items-center gap-2 rounded-xl px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === "users"
                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <Users className="h-4 w-4" /> Equipe
            </button>
            <button
              onClick={() => setActiveTab("categories")}
              className={`flex items-center gap-2 rounded-xl px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === "categories"
                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <FolderTree className="h-4 w-4" /> Categorias
            </button>
            <button
              onClick={() => setActiveTab("integration")}
              className={`flex items-center gap-2 rounded-xl px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === "integration"
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <Link2 className="h-4 w-4" /> Integração
            </button>
          </nav>
        </header>

        <div className="float-up">
          {activeTab === "users" ? (
            <UserList profiles={profiles} loading={usersLoading} onRefresh={fetchUsers} />
          ) : activeTab === "categories" ? (
            <CategoryManager />
          ) : (
            <IntegrationManager />
          )}
        </div>
      </div>
    </div>
  );
}

function UserList({
  profiles,
  loading,
  onRefresh,
}: {
  profiles: any[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const { user: currentUser } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  async function toggleRole(targetUserId: string, currentRole: string) {
    setBusy(targetUserId);
    try {
      const newRole = currentRole === "admin" ? "user" : "admin";
      const { error } = await supabase
        .from("user_roles")
        .upsert({ user_id: targetUserId, role: newRole }, { onConflict: "user_id" });
      if (error) throw error;
      toast.success(`Cargo alterado para ${newRole.toUpperCase()}`);
      onRefresh();
    } catch (err: any) {
      toast.error(`Erro: ${err.message || "Erro desconhecido"}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleEditName(targetUserId: string, currentName: string) {
    const newName = prompt(`NOVO NOME PARA ${currentName.toUpperCase()}:`, currentName);
    if (!newName || newName === currentName) return;
    setBusy(targetUserId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: newName.trim().toUpperCase() })
        .eq("id", targetUserId);
      if (error) throw error;
      toast.success("Nome atualizado!");
      onRefresh();
    } catch (err: any) {
      toast.error(`Erro: ${err.message || "Erro desconhecido"}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteUser(targetUserId: string, userName: string) {
    if (!confirm(`Tem certeza que deseja EXCLUIR DEFINITIVAMENTE o usuário ${userName.toUpperCase()}?`)) return;
    setBusy(targetUserId);
    try {
      const { error } = await supabase.from("profiles").delete().eq("id", targetUserId);
      if (error) throw error;
      await supabase.from("user_roles").delete().eq("user_id", targetUserId);
      toast.success(`Usuário ${userName.toUpperCase()} excluído com sucesso.`);
      onRefresh();
    } catch (err: any) {
      toast.error(`Erro ao excluir: ${err.message || "Erro desconhecido"}`);
    } finally {
      setBusy(null);
    }
  }

  if (loading)
    return (
      <div className="p-10 text-center opacity-50 uppercase tracking-widest text-[10px]">
        Carregando equipe...
      </div>
    );

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 border-b border-white/5 pb-4">
        <h3 className="text-lg font-black tracking-widest text-gradient flex items-center gap-2 uppercase">
          <Users className="h-5 w-5 text-accent" /> Equipe Registrada
        </h3>
        <div className="flex items-center gap-4">
          <span className="text-[10px] uppercase tracking-widest opacity-50 font-black">
            {profiles.length} Membros
          </span>
          <button
            onClick={() => setShowAdminPanel(!showAdminPanel)}
            className="btn-futuristic py-2 px-4 text-[10px] rounded-lg"
          >
            {showAdminPanel ? "FECHAR" : "CRIAR ACESSO"}
          </button>
        </div>
      </div>

      {showAdminPanel && (
        <div className="mb-6 animate-in slide-in-from-top-4">
          <AdminPanel onSuccess={() => { setShowAdminPanel(false); onRefresh(); }} />
        </div>
      )}

      <div className="space-y-3">
        {profiles.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div
                className={`p-3 rounded-xl transition-all ${p.role === "admin" ? "bg-accent/20 text-accent glow-sm" : "bg-white/5 text-muted-foreground"}`}
              >
                {p.role === "admin" ? (
                  <ShieldCheck className="h-5 w-5" />
                ) : (
                  <UserIcon className="h-5 w-5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm uppercase tracking-widest">{p.name}</p>
                  {p.id === currentUser?.id && (
                    <span className="text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-md font-black">
                      VOCÊ
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground font-mono opacity-60 mt-0.5">
                  {p.email}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {p.id !== currentUser?.id && (
                <>
                  <button
                    onClick={() => handleEditName(p.id, p.name)}
                    className="p-2 text-muted-foreground hover:text-accent hover:bg-accent/10 rounded-lg transition-all"
                    title="Editar Nome"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => toggleRole(p.id, p.role)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${p.role === "admin" ? "border-accent/40 text-accent bg-accent/5" : "border-white/10 text-muted-foreground hover:border-white/40"}`}
                  >
                    {busy === p.id ? "..." : p.role === "admin" ? "Rebaixar" : "Tornar ADM"}
                  </button>
                  <button
                    onClick={() => handleDeleteUser(p.id, p.name)}
                    className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all ml-1"
                    title="Excluir Usuário"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface SubCategory {
  id: string;
  name: string;
  category_id: string;
  user_id?: string | null;
}

function CategoryManager() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<SubCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"income" | "expense">("expense");
  const [expandedId, setExpandedId] = useState<string | null>(null);
 
   async function load() {
     setLoading(true);
     const [cats, subs] = await Promise.all([
       supabase.from("financial_categories").select("*").order("name"),
       supabase.from("financial_subcategories").select("*").order("name"),
     ]);
     if (!cats.error && cats.data) setCategories(cats.data as Category[]);
     if (!subs.error && subs.data) setSubcategories(subs.data as SubCategory[]);
     setLoading(false);
   }
 
   useEffect(() => {
     load();
   }, []);
 
   async function handleAdd() {
     if (!newName.trim() || !user) return;
     const { error } = await supabase.from("financial_categories").insert({
       name: newName.trim().toUpperCase(),
       type: newType,
       user_id: user.id,
     });
     if (error) {
       toast.error(error.message);
       return;
     }
     toast.success("Categoria adicionada");
     setNewName("");
     load();
   }
 
   async function handleDelete(id: string) {
     if (!confirm("Excluir categoria? Subcategorias vinculadas também serão removidas.")) return;
     const { error } = await supabase.from("financial_categories").delete().eq("id", id);
     if (error) {
       toast.error(error.message);
       return;
     }
     toast.success("Excluída");
     load();
   }
 
   async function handleAddSub(categoryId: string) {
     if (!user) return;
     const name = prompt("Nome da nova subcategoria:");
     if (!name?.trim()) return;
     const { error } = await supabase.from("financial_subcategories").insert({
       name: name.trim().toUpperCase(),
       category_id: categoryId,
       user_id: user.id,
     });
     if (error) {
       toast.error(error.message);
       return;
     }
     toast.success("Subcategoria adicionada");
     load();
   }
 
   async function handleDeleteSub(id: string) {
     if (!confirm("Excluir subcategoria?")) return;
     const { error } = await supabase.from("financial_subcategories").delete().eq("id", id);
     if (error) {
       toast.error(error.message);
       return;
     }
     toast.success("Subcategoria excluída");
     load();
   }
 
   const incomeCategories = categories.filter((c) => c.type === "income");
   const expenseCategories = categories.filter((c) => c.type === "expense");
 
   function renderCategoryList(list: Category[], type: "income" | "expense") {
     if (list.length === 0) {
       return (
         <div className="p-6 text-center opacity-40 uppercase tracking-widest text-[10px]">
           Nenhuma categoria de {type === "income" ? "receita" : "despesa"}
         </div>
       );
     }
 
     return (
       <div className="space-y-2 pr-1">
         {list.map((c) => {
           const subs = subcategories.filter((s) => s.category_id === c.id);
           const isOpen = expandedId === c.id;
           return (
             <div
               key={c.id}
               className="rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all overflow-hidden"
             >
               <div className="flex items-center justify-between p-3 group">
                 <button
                   onClick={() => setExpandedId(isOpen ? null : c.id)}
                   className="flex items-center gap-3 flex-1 text-left cursor-pointer animate-in fade-in"
                 >
                   <div
                     className={`w-1.5 h-6 rounded-full transition-all ${c.type === "income" ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"}`}
                   />
                   <span className="text-xs font-bold uppercase tracking-widest text-white group-hover:text-accent transition-colors">{c.name}</span>
                   {subs.length > 0 && (
                     <span className="text-[9px] font-black opacity-60 px-1.5 py-0.5 rounded bg-white/10">
                       {subs.length}
                     </span>
                   )}
                 </button>
                 <div className="flex items-center gap-1">
                   <button
                     onClick={() => handleAddSub(c.id)}
                     className="p-2 text-muted-foreground hover:text-accent hover:bg-accent/10 rounded-lg transition-all cursor-pointer"
                     title="Nova subcategoria"
                   >
                     <Plus className="h-4 w-4" />
                   </button>
                   <button
                     onClick={() => handleDelete(c.id)}
                     className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                     title="Excluir categoria"
                   >
                     <Trash2 className="h-4 w-4" />
                   </button>
                 </div>
               </div>
 
               {isOpen && (
                 <div className="border-t border-white/5 bg-black/30 p-3 space-y-1 animate-in slide-in-from-top-2 duration-200">
                   {subs.length === 0 ? (
                     <div className="text-[10px] uppercase tracking-widest opacity-40 text-center py-2">
                       Nenhuma subcategoria. Clique no botão "+" ao lado do título para criar.
                     </div>
                   ) : (
                     subs.map((s) => (
                       <div
                         key={s.id}
                         className="flex items-center justify-between pl-6 pr-2 py-2 rounded-lg hover:bg-white/5 group/sub"
                       >
                         <div className="flex items-center gap-2">
                           <div className="w-2 h-px bg-white/20" />
                           <span className="text-[11px] font-bold uppercase tracking-widest opacity-80 text-white/95">
                             {s.name}
                           </span>
                         </div>
                         <button
                           onClick={() => handleDeleteSub(s.id)}
                           className="p-1.5 text-muted-foreground hover:text-red-500 opacity-0 group-hover/sub:opacity-100 transition-all cursor-pointer"
                           title="Excluir subcategoria"
                         >
                           <X className="h-3 w-3" />
                         </button>
                       </div>
                     ))
                   )}
                 </div>
               )}
             </div>
           );
         })}
       </div>
     );
   }
 
   return (
     <div className="glass rounded-3xl p-6 border-2 border-white/5 shadow-xl">
       <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
         <h3 className="text-lg font-black tracking-widest text-gradient flex items-center gap-2 uppercase">
           <FolderTree className="h-5 w-5 text-accent" /> Gestão de Categorias
         </h3>
       </div>
 
       <div className="mb-8 p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
         <div className="flex flex-col lg:flex-row gap-3">
           <input
             value={newName}
             onChange={(e) => setNewName(e.target.value.toUpperCase())}
             onKeyDown={(e) => e.key === "Enter" && handleAdd()}
             placeholder="NOME DA NOVA CATEGORIA"
             className="input-futuristic flex-1 rounded-xl px-4 py-4 text-sm uppercase font-bold bg-black/25 border-2 border-white/10 text-white focus:border-accent"
           />
           <div className="flex gap-2 p-1 rounded-xl bg-black/25 border border-white/10 self-start lg:self-auto w-full lg:w-auto justify-center">
             <button
               onClick={() => setNewType("expense")}
               className={`flex-1 lg:flex-none px-4 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer ${newType === "expense" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "text-muted-foreground hover:text-white"}`}
             >
               <TrendingDown className="h-3 w-3 inline mr-1" /> Despesa
             </button>
             <button
               onClick={() => setNewType("income")}
               className={`flex-1 lg:flex-none px-4 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer ${newType === "income" ? "bg-green-500/20 text-green-400 border border-green-500/30" : "text-muted-foreground hover:text-white"}`}
             >
               <TrendingUp className="h-3 w-3 inline mr-1" /> Receita
             </button>
           </div>
           <button
             onClick={handleAdd}
             className="btn-futuristic rounded-xl px-8 py-4 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer shadow-glow-sm"
           >
             <Plus className="h-4 w-4" /> Adicionar Categoria
           </button>
         </div>
         <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black opacity-60">
           * Para criar subcategorias, clique no ícone "+" ao lado do título da categoria correspondente.
         </p>
       </div>
 
       {loading ? (
         <div className="p-12 text-center opacity-50 uppercase tracking-widest text-xs font-bold flex items-center justify-center gap-3">
           <FolderTree className="h-5 w-5 animate-pulse text-accent" /> Carregando categorias...
         </div>
       ) : (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           {/* Coluna de Receitas */}
           <div className="space-y-4 bg-white/[0.01] p-4 rounded-2xl border border-white/5">
             <div className="flex items-center justify-between border-b border-green-500/10 pb-3">
               <h4 className="text-xs font-black uppercase tracking-[0.2em] text-green-400 flex items-center gap-2">
                 <TrendingUp className="h-4 w-4" /> Receitas
               </h4>
               <span className="text-[9px] font-black uppercase tracking-wider bg-green-500/15 text-green-400 px-3 py-1 rounded-full border border-green-500/20">
                 {incomeCategories.length} categorias
               </span>
             </div>
             <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
               {renderCategoryList(incomeCategories, "income")}
             </div>
           </div>
 
           {/* Coluna de Despesas */}
           <div className="space-y-4 bg-white/[0.01] p-4 rounded-2xl border border-white/5">
             <div className="flex items-center justify-between border-b border-red-500/10 pb-3">
               <h4 className="text-xs font-black uppercase tracking-[0.2em] text-red-400 flex items-center gap-2">
                 <TrendingDown className="h-4 w-4" /> Despesas
               </h4>
               <span className="text-[9px] font-black uppercase tracking-wider bg-red-500/15 text-red-400 px-3 py-1 rounded-full border border-red-500/20">
                 {expenseCategories.length} categorias
               </span>
             </div>
             <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
               {renderCategoryList(expenseCategories, "expense")}
             </div>
           </div>
         </div>
       )}
     </div>
  );
}
