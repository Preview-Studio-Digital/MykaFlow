import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { IdentifierManager } from "@/components/IdentifierManager";
import { ShieldCheck, LogOut, LayoutDashboard, Users } from "lucide-react";
import { toast } from "sonner";
import { type TxRow } from "@/components/TransactionList";

export function AdminPanel() {
  const { user, loading, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && (!user || role !== "admin")) {
      navigate({ to: "/login" });
    }
  }, [user, loading, role, navigate]);

  useEffect(() => {
    if (user && role === "admin") {
      loadData();
    }
  }, [user, role]);

  async function loadData() {
    setFetching(true);
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("occurred_on", { ascending: false });
      
      if (error) throw error;
      if (data) setRows(data as TxRow[]);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar dados do admin");
    } finally {
      setFetching(false);
    }
  }

  const expenseCats = useMemo(() => {
    const set = new Set<string>();
    rows.filter(r => r.type === "expense").forEach(r => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set).sort();
  }, [rows]);

  const incomeCats = useMemo(() => {
    const set = new Set<string>();
    rows.filter(r => r.type === "income").forEach(r => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set).sort();
  }, [rows]);

  if (loading || fetching || !user || role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground bg-[#0a0c14]">
        Verificando credenciais...
      </div>
    );
  }

  return (
    <div className="relative z-10 min-h-screen px-4 py-8 md:px-8 bg-[#0a0c14] text-white">
      <div className="absolute inset-0 -z-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
      
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/20 p-2 glow">
            <ShieldCheck className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-widest text-gradient uppercase">Painel Administrativo</h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Gestão de Identificadores e Equipe</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/" })}
            className="btn-ghost-neon rounded-lg px-4 py-2 text-xs flex items-center gap-2"
          >
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </button>
          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
            className="btn-ghost-neon rounded-lg px-4 py-2 text-xs flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="space-y-6">
          <div className="glass rounded-2xl p-6 border-accent/20 border">
            <h2 className="text-lg font-bold tracking-widest uppercase mb-6 flex items-center gap-2 text-accent">
              <Users className="h-5 w-5" /> Gestão de Identificadores
            </h2>
            <div className="space-y-8">
              <IdentifierManager 
                title="Despesas" 
                type="expense" 
                identifiers={expenseCats} 
                onUpdated={loadData} 
              />
              <div className="h-px bg-white/5" />
              <IdentifierManager 
                title="Receitas" 
                type="income" 
                identifiers={incomeCats} 
                onUpdated={loadData} 
              />
            </div>
          </div>
        </section>

        <section className="glass rounded-2xl p-6 flex flex-col items-center justify-center text-center opacity-50 border-white/5 border pointer-events-none">
          <Users className="h-12 w-12 mb-4 text-muted-foreground" />
          <h2 className="text-xl font-bold uppercase tracking-widest">Gestão de Funcionários</h2>
          <p className="text-sm text-muted-foreground mt-2">Funcionalidade em desenvolvimento</p>
        </section>
      </div>
    </div>
  );
}
