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
  parent_id?: string | null;
  isTemporary?: boolean;
}

function AdminPage() {
  const { user, role, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"users" | "categories">("users");
  
  const [profiles, setProfiles] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  async function fetchUsers() {
    setUsersLoading(true);
    try {
      const { data: profs, error: pErr } = await supabase.from("profiles").select("*");
      if (pErr) throw pErr;
      
      const { data: roles, error: rErr } = await supabase.from("user_roles").select("*");
      
      const merged = (profs || []).map(p => ({
        id: p.id,
        email: p.email,
        name: p.display_name || "Sem nome",
        role: roles?.find(r => r.user_id === p.id)?.role || "user"
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

  if (authLoading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground uppercase tracking-widest text-xs text-center">Carregando Central ADM...</div>;

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-center">
        <ShieldCheck className="h-16 w-16 text-muted-foreground opacity-20" />
        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-widest text-gradient uppercase">Acesso Restrito</h1>
          <p className="max-w-xs text-sm text-muted-foreground">Você precisa estar logado como administrador para acessar esta área.</p>
        </div>
        <Link to="/login" className="btn-futuristic rounded-xl px-8 py-3 text-xs font-bold uppercase tracking-widest">
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
          <h1 className="text-2xl font-black tracking-widest text-red-500 uppercase">ACESSO NEGADO</h1>
          <p className="max-w-xs text-sm text-muted-foreground">Seu usuário ({user.email}) não tem permissões de administrador.</p>
        </div>
        <Link to="/" className="btn-ghost-neon rounded-xl px-8 py-3 text-xs font-bold uppercase tracking-widest">
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
            <Link to="/" className="group flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 border border-white/10 transition-all hover:bg-primary/20 hover:border-primary/30">
              <ChevronLeft className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-white" />
            </Link>
            <div>
              <h1 className="text-4xl font-black tracking-widest text-gradient uppercase leading-none mb-1">Central ADM</h1>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-black opacity-60">Gestão de Equipe e Configurações</p>
            </div>
          </div>

          <nav className="flex gap-2 p-1 rounded-2xl bg-white/5 border border-white/10">
            <button
              onClick={() => setActiveTab("users")}
              className={`flex items-center gap-2 rounded-xl px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === "users" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <Users className="h-4 w-4" /> Equipe
            </button>
            <button
              onClick={() => setActiveTab("categories")}
              className={`flex items-center gap-2 rounded-xl px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === "categories" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <FolderTree className="h-4 w-4" /> Categorias
            </button>
          </nav>
        </header>

        <div className="float-up">
          {activeTab === "users" ? (
            <div className="space-y-6">
              <AdminPanel onSuccess={fetchUsers} />
              <UserList profiles={profiles} loading={usersLoading} onRefresh={fetchUsers} />
            </div>
          ) : (
            <CategoryManager />
          )}
        </div>
      </div>
    </div>
  );
}

function UserList({ profiles, loading, onRefresh }: { profiles: any[], loading: boolean, onRefresh: () => void }) {
  const delUser = useServerFn(adminDeleteUser);
  const { user: currentUser } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggleRole(targetUserId: string, currentRole: string) {
    setBusy(targetUserId);
    try {
      const newRole = currentRole === 'admin' ? 'user' : 'admin';
      await supabase.from("user_roles").delete().eq("user_id", targetUserId);
      const { error } = await supabase.from("user_roles").insert({ user_id: targetUserId, role: newRole });
      if (error) throw error;
      toast.success(`Cargo alterado para ${newRole.toUpperCase()}`);
      onRefresh();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleEditName(targetUserId: string, currentName: string) {
    const newName = prompt(`NOVO NOME PARA ${currentName.toUpperCase()}:`, currentName);
    if (!newName || newName === currentName) return;
    setBusy(targetUserId);
    try {
      const { error } = await supabase.from("profiles").update({ display_name: newName.trim().toUpperCase() }).eq("id", targetUserId);
      if (error) throw error;
      toast.success("Nome atualizado!");
      onRefresh();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="p-10 text-center opacity-50 uppercase tracking-widest text-[10px]">Carregando equipe...</div>;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
        <h3 className="text-lg font-black tracking-widest text-gradient flex items-center gap-2 uppercase">
          <Users className="h-5 w-5 text-accent" /> Equipe Registrada
        </h3>
        <span className="text-[10px] uppercase tracking-widest opacity-50 font-black">
          {profiles.length} Membros
        </span>
      </div>

      <div className="space-y-3">
        {profiles.map(p => (
          <div key={p.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all group">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl transition-all ${p.role === 'admin' ? 'bg-accent/20 text-accent glow-sm' : 'bg-white/5 text-muted-foreground'}`}>
                {p.role === 'admin' ? <ShieldCheck className="h-5 w-5" /> : <UserIcon className="h-5 w-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm uppercase tracking-widest">{p.name}</p>
                  {p.id === currentUser?.id && <span className="text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-md font-black">VOCÊ</span>}
                </div>
                <p className="text-[10px] text-muted-foreground font-mono opacity-60 mt-0.5">{p.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {p.id !== currentUser?.id && (
                <>
                  <button onClick={() => handleEditName(p.id, p.name)} className="p-2 text-muted-foreground hover:text-accent hover:bg-accent/10 rounded-lg transition-all" title="Editar Nome">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => toggleRole(p.id, p.role)} 
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${p.role === 'admin' ? 'border-accent/40 text-accent bg-accent/5' : 'border-white/10 text-muted-foreground hover:border-white/40'}`}
                  >
                    {busy === p.id ? '...' : p.role === 'admin' ? 'Rebaixar' : 'Tornar ADM'}
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

function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"income" | "expense">("expense");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("financial_categories").select("*").order("name");
    if (!error && data) setCategories(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    if (!newName) return;
    const { error } = await supabase.from("financial_categories").insert({ name: newName.trim().toUpperCase(), type: newType });
    if (!error) { toast.success("Categoria adicionada"); setNewName(""); load(); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir categoria?")) return;
    const { error } = await supabase.from("financial_categories").delete().eq("id", id);
    if (!error) { toast.success("Excluída"); load(); }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="glass rounded-2xl p-6 h-fit">
        <h3 className="text-lg font-black tracking-widest text-gradient flex items-center gap-2 uppercase mb-6">
          <Plus className="h-5 w-5 text-accent" /> Nova Categoria
        </h3>
        <div className="space-y-4">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="NOME DA CATEGORIA" className="input-futuristic w-full rounded-xl px-4 py-3 text-sm" />
          <div className="flex gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
            <button onClick={() => setNewType("expense")} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${newType === 'expense' ? 'bg-red-500/20 text-red-400' : 'text-muted-foreground'}`}>Despesa</button>
            <button onClick={() => setNewType("income")} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${newType === 'income' ? 'bg-green-500/20 text-green-400' : 'text-muted-foreground'}`}>Receita</button>
          </div>
          <button onClick={handleAdd} className="btn-futuristic w-full rounded-xl py-3 text-xs font-black uppercase tracking-widest">Adicionar</button>
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <h3 className="text-lg font-black tracking-widest text-gradient flex items-center gap-2 uppercase mb-6">
          <FolderTree className="h-5 w-5 text-accent" /> Listagem
        </h3>
        <div className="space-y-2">
          {categories.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 group hover:border-white/10 transition-all">
              <div className="flex items-center gap-3">
                <div className={`w-1 h-6 rounded-full ${c.type === 'income' ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-xs font-bold uppercase tracking-widest">{c.name}</span>
              </div>
              <button onClick={() => handleDelete(c.id)} className="p-2 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
