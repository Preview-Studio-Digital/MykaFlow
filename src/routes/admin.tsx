import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
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
  PieChart as PieChartIcon,
  Bell as BellIcon,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { IntegrationManager } from "@/components/IntegrationManager";
import { CrmAnalytics } from "@/components/CrmAnalytics";
import { AdminAlertsManager } from "@/components/AdminAlertsManager";
import { WorkHoursManager } from "@/components/WorkHoursManager";
import { EditMemberDialog, type MemberProfile } from "@/components/EditMemberDialog";
import { Wallet } from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"analytics" | "alerts" | "users" | "categories" | "integration" | "work_hours">("analytics");

  const [profiles, setProfiles] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [selectedUserToEdit, setSelectedUserToEdit] = useState<MemberProfile | null>(null);

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
    <div className="relative z-10 min-h-screen lg:h-screen lg:overflow-hidden px-4 py-3 md:px-8 flex flex-col justify-start">
      <div className="mx-auto max-w-7xl w-full flex-1 flex flex-col min-h-0">
        <header className="mb-3 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3.5">
            <Link
              to="/"
              className="group flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 border border-white/10 transition-all hover:bg-primary/20 hover:border-primary/30 shrink-0"
              title="Voltar ao Início"
            >
              <ChevronLeft className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-white" />
            </Link>
            <div className="flex flex-col justify-center">
              <svg
                viewBox="0 0 280 42"
                className="w-[230px] sm:w-[270px] h-[40px] overflow-visible select-none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <text
                  x="0"
                  y="22"
                  className="font-saira-stencil"
                  fontSize="22"
                  fill="#22d3ee"
                  textLength="280"
                  lengthAdjust="spacing"
                  style={{ filter: "drop-shadow(0px 0px 14px rgba(34, 211, 238, 0.45))" }}
                >
                  ADMINISTRAÇÃO
                </text>
                <text
                  x="0"
                  y="38"
                  fontSize="8.5"
                  fontWeight="700"
                  fill="#94a3b8"
                  textLength="280"
                  lengthAdjust="spacing"
                  fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                  opacity="0.8"
                >
                  GESTÃO DE EQUIPE, ANÁLISES E CONFIGURAÇÕES
                </text>
              </svg>
            </div>
          </div>

          <nav className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/5 border border-white/10 overflow-x-auto max-w-full no-scrollbar shrink-0">
            <button
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "analytics"
                  ? "bg-sky-500 text-white shadow-lg shadow-sky-500/25"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <PieChartIcon className="h-3.5 w-3.5" /> Atividades & Gráficos
            </button>
            <button
              onClick={() => setActiveTab("work_hours")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "work_hours"
                  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <Clock className="h-3.5 w-3.5" /> Horas de Trabalho
            </button>
            <button
              onClick={() => setActiveTab("alerts")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "alerts"
                  ? "bg-amber-500 text-black font-black shadow-lg shadow-amber-500/25"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <BellIcon className="h-3.5 w-3.5" /> Alertas & Auditoria
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "users"
                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <Users className="h-3.5 w-3.5" /> Equipe
            </button>
            <button
              onClick={() => setActiveTab("categories")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "categories"
                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <FolderTree className="h-3.5 w-3.5" /> Categorias
            </button>
            <button
              onClick={() => setActiveTab("integration")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "integration"
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <Link2 className="h-3.5 w-3.5" /> Integração
            </button>
          </nav>
        </header>

        <div className="float-up flex-1 min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden">
          {activeTab === "analytics" ? (
            <CrmAnalytics />
          ) : activeTab === "alerts" ? (
            <AdminAlertsManager />
          ) : activeTab === "work_hours" ? (
            <WorkHoursManager />
          ) : activeTab === "users" ? (
            <UserList
              profiles={profiles}
              loading={usersLoading}
              onRefresh={fetchUsers}
              selectedUserToEdit={selectedUserToEdit}
              setSelectedUserToEdit={setSelectedUserToEdit}
            />
          ) : activeTab === "categories" ? (
            <CategoryManager />
          ) : (
            <IntegrationManager />
          )}
        </div>
      </div>

      {/* Renderizado na raiz do AdminPage para evitar bugs de transform: translateY (float-up) */}
      <EditMemberDialog
        isOpen={Boolean(selectedUserToEdit)}
        onClose={() => setSelectedUserToEdit(null)}
        targetUser={selectedUserToEdit}
        onSuccess={() => {
          setSelectedUserToEdit(null);
          fetchUsers();
        }}
      />
    </div>
  );
}

function UserList({
  profiles,
  loading,
  onRefresh,
  selectedUserToEdit,
  setSelectedUserToEdit,
}: {
  profiles: any[];
  loading: boolean;
  onRefresh: () => void;
  selectedUserToEdit: MemberProfile | null;
  setSelectedUserToEdit: (user: MemberProfile | null) => void;
}) {
  const { user: currentUser } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

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
          <Users className="h-5 w-5 text-accent" /> Gestão de Equipe & Permissões
        </h3>
        <div className="flex items-center gap-4">
          <span className="text-[10px] uppercase tracking-widest opacity-50 font-black">
            {profiles.length} Membros
          </span>
          <button
            onClick={() => setShowAdminPanel(!showAdminPanel)}
            className="btn-futuristic py-2 px-4 text-[10px] rounded-lg cursor-pointer"
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
        {profiles.map((p) => {
          const isCurrentUser = p.id === currentUser?.id;
          const userRole = p.role || "user";
          const isAdmin = userRole === "admin";
          const isFinance = userRole === "financeiro";

          return (
            <div
              key={p.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all gap-4 group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className={`p-3 rounded-2xl transition-all shrink-0 ${
                    isAdmin
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.25)]"
                      : isFinance
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                      : "bg-sky-500/20 text-sky-400 border border-sky-500/30 shadow-[0_0_15px_rgba(56,189,248,0.25)]"
                  }`}
                >
                  {isAdmin ? (
                    <ShieldCheck className="h-5 w-5" />
                  ) : isFinance ? (
                    <Wallet className="h-5 w-5" />
                  ) : (
                    <Users className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-sm uppercase tracking-widest text-white truncate">
                      {p.name}
                    </p>
                    {isCurrentUser && (
                      <span className="text-[8px] bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded-md font-black">
                        VOCÊ
                      </span>
                    )}

                    {/* Role Badge */}
                    <span
                      className={`text-[9px] font-mono font-black px-2 py-0.5 rounded-lg border uppercase tracking-wider ${
                        isAdmin
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : isFinance
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : "bg-sky-500/20 text-sky-300 border-sky-500/40"
                      }`}
                    >
                      {isAdmin ? "🛡️ ADM" : isFinance ? "💵 FINANCEIRO" : "👥 CRM"}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono opacity-70 mt-0.5 truncate">
                    {p.email}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  onClick={() => setSelectedUserToEdit(p)}
                  className="btn-ghost-neon px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-cyan-300 border-cyan-500/30 flex items-center gap-1.5 hover:bg-cyan-500/10 cursor-pointer"
                  title="Editar dados e direitos de acesso"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  <span>Editar Direitos</span>
                </button>

                {!isCurrentUser && (
                  <button
                    onClick={() => handleDeleteUser(p.id, p.name)}
                    className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer border border-transparent hover:border-red-500/30"
                    title="Excluir Usuário"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
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
