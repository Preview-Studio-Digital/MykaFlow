import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { AdminPanel } from "@/components/AdminPanel";
import { ShieldCheck, ChevronLeft, Users, Settings, Plus, Trash2, Edit2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"users" | "categories">("users");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (!user || role !== "admin") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Acesso restrito a administradores.</p>
        <Link to="/" className="btn-futuristic rounded-lg px-6 py-2">Voltar para Home</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="btn-ghost-neon rounded-lg p-2">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-widest text-gradient flex items-center gap-2">
                <ShieldCheck className="h-6 w-6" /> Central Administrativa
              </h1>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Gestão de acessos e configurações do sistema
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1 space-y-2">
            <button
              onClick={() => setActiveTab("users")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                activeTab === "users" 
                ? "bg-accent/20 text-accent border border-accent/40 shadow-glow" 
                : "text-muted-foreground hover:bg-white/5"
              }`}
            >
              <Users className="h-4 w-4" />
              <span className="text-sm font-bold uppercase tracking-widest">Usuários</span>
            </button>
            <button
              onClick={() => setActiveTab("categories")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                activeTab === "categories" 
                ? "bg-accent/20 text-accent border border-accent/40 shadow-glow" 
                : "text-muted-foreground hover:bg-white/5"
              }`}
            >
              <Settings className="h-4 w-4" />
              <span className="text-sm font-bold uppercase tracking-widest">Categorias</span>
            </button>
          </div>

          <div className="md:col-span-3 space-y-6">
            {activeTab === "users" ? (
              <>
                <AdminPanel />
                <UserList />
              </>
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
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select(`
            id,
            display_name,
            email,
            user_roles (role)
          `);
        
        if (error) throw error;
        setProfiles(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, []);

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-lg font-bold tracking-widest text-gradient mb-4 flex items-center gap-2">
        <Users className="h-5 w-5" /> Usuários Cadastrados
      </h3>
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-8 opacity-50 text-xs uppercase tracking-widest">Carregando lista...</div>
        ) : profiles.map(p => (
          <div key={p.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
            <div>
              <p className="font-bold text-sm uppercase tracking-widest">{p.display_name || "Sem nome"}</p>
              <p className="text-[10px] text-muted-foreground font-mono">{p.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-[9px] px-2 py-0.5 rounded-full border uppercase tracking-widest font-bold ${
                p.user_roles?.[0]?.role === 'admin' 
                ? 'border-accent text-accent bg-accent/10' 
                : 'border-white/20 text-muted-foreground'
              }`}>
                {p.user_roles?.[0]?.role || 'user'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryManager() {
  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-lg font-bold tracking-widest text-gradient mb-4 flex items-center gap-2">
        <Settings className="h-5 w-5" /> Gestão de Categorias
      </h3>
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-accent">Categorias de Despesa</h4>
            <button className="btn-ghost-neon rounded-lg px-3 py-1 flex items-center gap-1 text-[10px] uppercase font-bold">
              <Plus className="h-3 w-3" /> Adicionar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {["ENERGIA", "ÁGUA", "INTERNET", "TELEFONIA", "FROTA", "ESTRUTURA"].map(cat => (
              <div key={cat} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <span className="text-xs font-bold tracking-widest">{cat}</span>
                <div className="flex items-center gap-2">
                  <button className="text-muted-foreground hover:text-accent"><Edit2 className="h-3 w-3" /></button>
                  <button className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
