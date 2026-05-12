import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { TransactionForm } from "@/components/TransactionForm";
import { TransactionList, type TxRow } from "@/components/TransactionList";
import { CategoryPie } from "@/components/CategoryPie";
import { EvolutionChart } from "@/components/EvolutionChart";
import { MiniEvolutionChart } from "@/components/MiniEvolutionChart";
import { fmtCurrency, MONTHS_PT } from "@/lib/finance-constants";
import { ProfileDialog } from "@/components/ProfileDialog";
import {
  LogOut,
  Zap,
  TrendingUp,
  TrendingDown,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Calendar,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const { user, loading, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dashboardMode, setDashboardMode] = useState<'monthly' | 'annual'>('monthly');


  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  async function load() {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("occurred_on", { ascending: false });
    if (!error && data) {
      setRows(data as TxRow[]);
      
      // Busca perfis para mostrar nomes de autores
      const { data: pData } = await supabase.from("profiles").select("id, display_name, email");
      let profilesList = pData || [];

      // Garante que o usuário atual esteja na lista (mesmo que a tabela de perfis falhe)
      if (user && !profilesList.find(p => p.id === user.id)) {
        profilesList.push({
          id: user.id,
          display_name: (user.user_metadata?.display_name || user.email?.split("@")[0] || "USUÁRIO").toUpperCase(),
          email: user.email
        });
      }

      setProfiles(profilesList);
      setRefreshKey(prev => prev + 1);
    }
  }

  // Escuta o banco de dados em TEMPO REAL
  useEffect(() => {
    if (!user) return;
    
    const channel = supabase
      .channel("db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => {
          load(); // Recarrega tudo se houver QUALQUER mudança no banco
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (user) {
      load();
      const syncProfile = async () => {
        try {
          const { error } = await supabase.from("profiles").upsert({
            id: user.id,
            display_name: (user.user_metadata?.display_name || user.email?.split("@")[0] || "USUÁRIO").toUpperCase(),
            email: user.email
          });
          if (error) {
            console.error("Erro na sincronização de perfil:", error);
          } else {
            // Recarrega perfis para garantir que a lista local esteja atualizada
            const { data: pData } = await supabase.from("profiles").select("id, display_name, email");
            if (pData) setProfiles(pData);
          }
        } catch (err) {
          console.error("Falha crítica na sincronização:", err);
        }
      };
      syncProfile();
    }
  }, [user]);

  const monthRows = useMemo(
    () =>
      rows.filter((r) => {
        const d = new Date(r.occurred_on + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === month;
      }),
    [rows, year, month]
  );

  const yearRows = useMemo(
    () => rows.filter((r) => {
      const d = new Date(r.occurred_on + "T00:00:00");
      return d.getFullYear() === year;
    }),
    [rows, year]
  );

  const activeRows = dashboardMode === 'annual' ? yearRows : monthRows;

  const expenseByCat = useMemo(() => agg(activeRows.filter((r) => r.type === "expense")), [activeRows]);
  const incomeByCat = useMemo(() => agg(activeRows.filter((r) => r.type === "income")), [activeRows]);

  const totalIncome = monthRows.filter((r) => r.type === "income").reduce((a, b) => a + Number(b.amount), 0);
  const totalExpense = monthRows.filter((r) => r.type === "expense").reduce((a, b) => a + Number(b.amount), 0);
  const balance = totalIncome - totalExpense;

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y--;
    } else if (m > 11) {
      m = 0;
      y++;
    }
    setMonth(m);
    setYear(y);
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="relative z-10 min-h-screen px-4 py-3 md:px-8">
      {/* Header */}
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/20 p-2 glow">
            <Zap className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-gradient leading-[0.8] mb-1">MYKAFLOW</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap ml-1">
              Controle financeiro empresarial
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end hidden sm:flex">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground opacity-60">
              {role === "admin" ? "Administrador" : "Funcionário"}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <button 
                onClick={() => setIsProfileOpen(true)}
                className="text-accent hover:text-white transition-colors hover:scale-110"
                title="Editar Perfil"
              >
                <UserIcon className="h-5 w-5" />
              </button>
              <p className="text-sm font-black uppercase tracking-widest text-white">
                {user?.user_metadata?.display_name || user?.email}
              </p>
            </div>
          </div>
          {role === "admin" && (
            <Link 
              to="/admin" 
              className="btn-ghost-neon rounded-lg px-3 py-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
              title="Central Administrativa"
            >
              <ShieldCheck className="h-4 w-4" /> ADM
            </Link>
          )}
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

      {/* Perfil Dialog */}
      <ProfileDialog 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)} 
        currentUser={user} 
      />

      {/* KPIs & Charts - Centralized Layout */}
      <section className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Left Column: Receitas */}
        <div className="flex flex-col">
          <CategoryPie
            key={`income-${refreshKey}-${year}-${month}-${dashboardMode}`}
            title={dashboardMode === 'annual' ? "Receitas Anuais por Categoria" : "Receitas Mensais por Categoria"}
            data={incomeByCat}
            transactions={monthRows.filter((r) => r.type === "income")}
            accent="oklch(0.8 0.16 150)"
            type="income"
            alignTitle="left"
          />
        </div>

        {/* Center Column: Period Control & Balance */}
        <div className="flex flex-col gap-2 h-full">
          <div className="glass rounded-2xl p-3 flex items-center justify-between min-h-[80px]">
            <button onClick={() => shiftMonth(-1)} className="btn-ghost-neon rounded-lg p-2">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center flex flex-col items-center gap-1">
              <p className="text-sm uppercase opacity-80 tracking-widest flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-6 w-6" /> Período
              </p>
              <p className="text-xl font-bold tracking-widest text-gradient uppercase">
                {MONTHS_PT[month]} {year}
              </p>
            </div>
            <button onClick={() => shiftMonth(1)} className="btn-ghost-neon rounded-lg p-2">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Kpi
            label="Saldo"
            value={balance}
            color={balance >= 0 ? "text-accent" : "text-destructive"}
            icon={<Wallet className="h-6 w-6" />}
          />
        </div>

        {/* Right Column: Despesas */}
        <div className="flex flex-col">
          <CategoryPie
            key={`expense-${refreshKey}-${year}-${month}-${dashboardMode}`}
            title={dashboardMode === 'annual' ? "Despesas Anuais por Categoria" : "Despesas Mensais por Categoria"}
            data={expenseByCat}
            transactions={monthRows.filter((r) => r.type === "expense")}
            accent="oklch(0.7 0.2 30)"
            type="expense"
            alignTitle="right"
          />
        </div>
      </section>

      <section className="mb-3">
        {/* Toggle MENSAL / ANUAL */}
        <div className="flex items-center justify-center gap-2 mb-3">
          <button
            onClick={() => setDashboardMode('monthly')}
            className={`btn-ghost-neon rounded-lg px-5 py-1.5 text-[11px] font-black uppercase tracking-widest transition-all ${
              dashboardMode === 'monthly' ? 'glow brightness-125' : 'opacity-50'
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setDashboardMode('annual')}
            className={`btn-ghost-neon rounded-lg px-5 py-1.5 text-[11px] font-black uppercase tracking-widest transition-all ${
              dashboardMode === 'annual' ? 'glow brightness-125' : 'opacity-50'
            }`}
          >
            Anual
          </button>
        </div>
        <EvolutionChart 
          key={`evolution-${refreshKey}`} 
          data={rows} 
          year={year} 
          month={month}
          onMonthChange={setMonth}
          forcedViewMode={dashboardMode === 'annual' ? 'annual' : 'monthly'}
        />
      </section>

      {/* Form */}
      <section className="mb-8 max-w-2xl mx-auto">
        <TransactionForm 
          onCreated={load} 
          defaultMonth={month} 
          defaultYear={year} 
          onMonthShift={shiftMonth}
        />
      </section>

      {/* List */}
      <section>
        <h2 className="mb-3 text-base font-bold uppercase tracking-widest text-muted-foreground">
          Lançamentos de {MONTHS_PT[month]}
        </h2>
        <TransactionList 
          key={`list-${refreshKey}`} 
          rows={monthRows} 
          onDeleted={load} 
          allProfiles={profiles} 
        />
      </section>

      <footer className="mt-10 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
        MykaFlow • {new Date().getFullYear()}
      </footer>
    </div>
  );
}

function agg(list: TxRow[]) {
  const map = new Map<string, number>();
  for (const r of list) {
    // Normalizando a categoria e aplicando o mapeamento solicitado
    let catName = (r.category || "Outros").trim().toUpperCase();
    if (catName === "ESTRUTURA EMPRESARIAL") catName = "ESTRUTURA";
    
    map.set(catName, (map.get(catName) ?? 0) + Number(r.amount));
  }
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

function Kpi({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-3 flex flex-col items-center justify-center text-center transition hover:scale-[1.02] hover:glow min-h-[80px]">
      <div className={`flex items-center gap-2 text-sm opacity-80 uppercase tracking-widest mb-1 ${color}`}>
        {icon} {label}
      </div>
      <div className={`text-2xl font-bold tracking-widest uppercase ${color}`}>
        {fmtCurrency(value)}
      </div>
    </div>
  );
}
