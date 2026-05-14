import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { TransactionList, type TxRow } from "@/components/TransactionList";
import { CategoryPie } from "@/components/CategoryPie";
import { EvolutionChart } from "@/components/EvolutionChart";

import { fmtCurrency, MONTHS_PT } from "@/lib/finance-constants";
import { ProfileDialog } from "@/components/ProfileDialog";
import { TransactionCreateDialog } from "@/components/TransactionCreateDialog";
import {
  LogOut,
  Zap,
  ChevronLeft,
  ShieldCheck,
  User as UserIcon,
  Lock,
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
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addType, setAddType] = useState<"income" | "expense">("expense");
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
      
      const { data: pData } = await supabase.from("profiles").select("id, display_name, email");
      let profilesList = pData || [];

      if (user && !profilesList.find(p => p.id === user.id)) {
        profilesList.push({
          id: user.id,
          display_name: (user.user_metadata?.display_name || user.email?.split("@")[0] || "USUÁRIO").toUpperCase(),
          email: user.email ?? null
        });
      }

      setProfiles(profilesList);
      setRefreshKey(prev => prev + 1);
    }
  }

  useEffect(() => {
    if (!user) return;
    
    const channel = supabase
      .channel("db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => {
          load();
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
          const profilePromise = supabase.from("profiles").upsert({
            id: user.id,
            display_name: (user.user_metadata?.display_name || user.email?.split("@")[0] || "USUÁRIO").toUpperCase(),
            email: user.email
          });
          
          // Garante que o usuário tenha pelo menos a role 'user' se não tiver nada
          const rolePromise = supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle().then(({ data }) => {
            if (!data) {
              return supabase.from("user_roles").insert({ user_id: user.id, role: "user" });
            }
          });

          await Promise.all([profilePromise, rolePromise]);
          
          const { data: pData } = await supabase.from("profiles").select("id, display_name, email");
          if (pData) setProfiles(pData);
        } catch (err) {
          console.error("Profile/Role sync fail:", err);
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

  const { minDate, maxDate } = useMemo(() => {
    if (rows.length === 0) {
      const now = new Date();
      return { minDate: now, maxDate: now };
    }
    const dates = rows.map(r => new Date(r.occurred_on + "T00:00:00").getTime());
    return {
      minDate: new Date(Math.min(...dates)),
      maxDate: new Date(Math.max(...dates))
    };
  }, [rows]);

  const comparisonData = useMemo(() => {
    const today = new Date();
    const isThisYear = today.getFullYear() === year;
    const isThisMonth = isThisYear && today.getMonth() === month;
    const currentDay = today.getDate();

    if (dashboardMode === 'annual') {
      const prevY = year - 1;
      const prevYearRows = rows.filter(r => {
        const [y] = r.occurred_on.split('-').map(Number);
        return y === prevY;
      });
      
      const prevIncome = prevYearRows.filter(r => r.type === 'income').reduce((a, b) => a + Number(b.amount), 0);
      const prevExpense = prevYearRows.filter(r => r.type === 'expense').reduce((a, b) => a + Number(b.amount), 0);
      
      return {
        prevIncome: prevYearRows.some(r => r.type === 'income') ? prevIncome : undefined,
        prevExpense: prevYearRows.some(r => r.type === 'expense') ? prevExpense : undefined
      };
    } else {
      // Mês passado (Sempre o mês cheio para garantir que os dados apareçam)
      let prevM = month - 1; 
      let prevY = year;
      if (prevM < 0) { prevM = 11; prevY--; }
      
      const prevMonthRows = rows.filter(r => {
        const [y, m] = r.occurred_on.split('-').map(Number);
        return y === prevY && (m - 1) === prevM;
      });

      const prevIncome = prevMonthRows.filter(r => r.type === 'income').reduce((a, b) => a + Number(b.amount), 0);
      const prevExpense = prevMonthRows.filter(r => r.type === 'expense').reduce((a, b) => a + Number(b.amount), 0);

      return {
        prevIncome: prevMonthRows.some(r => r.type === 'income') ? prevIncome : undefined,
        prevExpense: prevMonthRows.some(r => r.type === 'expense') ? prevExpense : undefined
      };
    }
  }, [rows, month, year, dashboardMode]);

  function getNextPeriod(m: number, y: number, delta: number) {
    let nextM = m + delta;
    let nextY = y;
    while (nextM < 0) {
      nextM += 12;
      nextY--;
    }
    while (nextM > 11) {
      nextM -= 12;
      nextY++;
    }
    return { m: nextM, y: nextY };
  }

  function shiftMonth(delta: number) {
    const next = getNextPeriod(month, year, delta);
    const targetDate = new Date(next.y, next.m, 1);
    const minBound = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const maxBound = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
    if (targetDate < minBound || targetDate > maxBound) return;
    setMonth(next.m);
    setYear(next.y);
  }

  function shiftMonthUnrestricted(delta: number) {
    const next = getNextPeriod(month, year, delta);
    setMonth(next.m);
    setYear(next.y);
  }

  const canShiftPrev = useMemo(() => {
    const prev = getNextPeriod(month, year, dashboardMode === 'annual' ? -12 : -1);
    const minB = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    return new Date(prev.y, prev.m, 1) >= minB;
  }, [month, year, dashboardMode, minDate]);

  const canShiftNext = useMemo(() => {
    const next = getNextPeriod(month, year, dashboardMode === 'annual' ? 12 : 1);
    const maxB = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
    return new Date(next.y, next.m, 1) <= maxB;
  }, [month, year, dashboardMode, maxDate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  // NOVA TRAVA DE SEGURANÇA: Bloqueio para usuários pendentes
  if (role !== "admin" && role !== "user") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12 bg-background">
        <div className="glass max-w-md w-full p-8 rounded-2xl text-center space-y-6 float-up">
          <div className="inline-flex p-4 rounded-full bg-accent/20 mb-4 pulse-glow">
            <Lock className="h-12 w-12 text-accent" />
          </div>
          <h1 className="text-3xl font-black tracking-widest text-gradient">ACESSO PENDENTE</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Olá, <span className="text-white font-bold">{user.email}</span>!<br/>
            Seu cadastro foi realizado com sucesso, mas o administrador **DIEGO** precisa validar seu acesso antes de você visualizar os dados da empresa.
          </p>
          <div className="pt-6 border-t border-white/10">
            <button
              onClick={async () => {
                await signOut();
                navigate({ to: "/login" });
              }}
              className="btn-ghost-neon w-full rounded-xl py-3 text-xs font-bold flex items-center justify-center gap-2"
            >
              <LogOut className="h-4 w-4" /> Sair do Sistema
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 min-h-screen px-4 py-3 md:px-8 min-w-[1280px] overflow-x-auto">
      <header className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/20 p-2 glow">
            <Zap className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-[0.12em] text-gradient leading-none mb-1">MYKAFLOW</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap">
              Controle financeiro empresarial
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground opacity-60">
              {role === "admin" ? "Administrador" : "Funcionário"}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <button 
                onClick={() => setIsProfileOpen(true)}
                className="text-accent hover:text-white transition-colors hover:scale-110"
              >
                <UserIcon className="h-5 w-5" />
              </button>
              <p className="text-sm font-black uppercase tracking-widest text-white">
                {user?.user_metadata?.display_name || user?.email}
              </p>
            </div>
          </div>
          {role === "admin" && (
            <Link to="/admin" className="btn-ghost-neon rounded-lg px-3 py-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
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

      <ProfileDialog isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} currentUser={user} />
      <TransactionCreateDialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreated={load}
        defaultType={addType}
        defaultMonth={month}
        defaultYear={year}
        onMonthShift={shiftMonthUnrestricted}
        onMonthYearChange={(m, y) => { setMonth(m); setYear(y); }}
      />

      <section className="mb-3 grid grid-cols-2 gap-3">
        <CategoryPie
          key={`income-${refreshKey}-${year}-${month}-${dashboardMode}`}
          title={dashboardMode === 'annual' ? "Receitas Anuais" : `Receitas ${MONTHS_PT[month]}`}
          data={incomeByCat}
          transactions={monthRows.filter((r) => r.type === "income")}
          accent="oklch(0.8 0.16 150)"
          type="income"
          alignTitle="left"
          onAddClick={() => { setAddType("income"); setIsAddOpen(true); }}
          prevTotal={comparisonData.prevIncome}
          comparisonLabel={dashboardMode === 'annual' ? "EM RELAÇÃO AO ANO PASSADO" : "EM RELAÇÃO AO MÊS PASSADO"}
        />
        <CategoryPie
          key={`expense-${refreshKey}-${year}-${month}-${dashboardMode}`}
          title={dashboardMode === 'annual' ? "Despesas Anuais" : `Despesas ${MONTHS_PT[month]}`}
          data={expenseByCat}
          transactions={monthRows.filter((r) => r.type === "expense")}
          accent="oklch(0.7 0.2 30)"
          type="expense"
          alignTitle="right"
          onAddClick={() => { setAddType("expense"); setIsAddOpen(true); }}
          prevTotal={comparisonData.prevExpense}
          comparisonLabel={dashboardMode === 'annual' ? "EM RELAÇÃO AO ANO PASSADO" : "EM RELAÇÃO AO MÊS PASSADO"}
        />
      </section>

      <section className="mb-3">
        <EvolutionChart 
          key={`evolution-${refreshKey}-${year}-${month}-${dashboardMode}`} 
          data={rows} 
          year={year} 
          month={month}
          onMonthChange={setMonth}
          onMonthShift={shiftMonth}
          forcedViewMode={dashboardMode === 'annual' ? 'annual' : 'monthly'}
          dashboardMode={dashboardMode}
          onDashboardModeChange={setDashboardMode}
          canShiftPrev={canShiftPrev}
          canShiftNext={canShiftNext}
        />
      </section>

      <section>
        <TransactionList 
          key={`list-${refreshKey}-${year}-${month}-${dashboardMode}`} 
          rows={activeRows} 
          onDeleted={load} 
          allProfiles={profiles} 
          title={dashboardMode === 'annual' ? `Lançamentos de ${year}` : `Lançamentos de ${MONTHS_PT[month]}`}
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
    let catName = (r.category || "Outros").trim().toUpperCase();
    if (catName === "ESTRUTURA EMPRESARIAL") catName = "ESTRUTURA";
    map.set(catName, (map.get(catName) ?? 0) + Number(r.amount));
  }
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}
