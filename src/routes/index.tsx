import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { TransactionForm } from "@/components/TransactionForm";
import { TransactionList, type TxRow } from "@/components/TransactionList";
import { CategoryPie } from "@/components/CategoryPie";
import { EvolutionChart } from "@/components/EvolutionChart";
import { fmtCurrency, MONTHS_PT } from "@/lib/finance-constants";
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

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  async function load() {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("occurred_on", { ascending: false });
    if (!error && data) setRows(data as TxRow[]);
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  const monthRows = useMemo(
    () =>
      rows.filter((r) => {
        const d = new Date(r.occurred_on + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === month;
      }),
    [rows, year, month]
  );

  const expenseByCat = useMemo(() => agg(monthRows.filter((r) => r.type === "expense")), [monthRows]);
  const incomeByCat = useMemo(() => agg(monthRows.filter((r) => r.type === "income")), [monthRows]);

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
    <div className="relative z-10 min-h-screen px-4 py-8 md:px-8">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/20 p-2 glow">
            <Zap className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-widest text-gradient">MYKAFLOW</h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Controle financeiro empresarial
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {role === "admin" ? "Administrador" : "Funcionário"}
            </p>
            <p className="text-sm font-mono">{user?.email}</p>
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

      {/* Month selector + KPIs */}
      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="glass rounded-2xl p-5 flex items-center justify-between md:col-span-1 min-h-[120px]">
          <button onClick={() => shiftMonth(-1)} className="btn-ghost-neon rounded-lg p-2">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center flex flex-col items-center gap-1">
            <p className="text-sm uppercase opacity-80 tracking-widest flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-6 w-6" /> Período
            </p>
            <p className="text-3xl font-bold tracking-widest text-gradient uppercase">
              {MONTHS_PT[month]} {year}
            </p>
          </div>
          <button onClick={() => shiftMonth(1)} className="btn-ghost-neon rounded-lg p-2">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <Kpi
          label="Receitas"
          value={totalIncome}
          color="text-accent"
          icon={<TrendingUp className="h-6 w-6" />}
        />
        <Kpi
          label="Despesas"
          value={totalExpense}
          color="text-destructive"
          icon={<TrendingDown className="h-6 w-6" />}
        />
        <Kpi
          label="Saldo"
          value={balance}
          color={balance >= 0 ? "text-accent" : "text-destructive"}
          icon={<Wallet className="h-6 w-6" />}
        />
      </section>

      {/* Charts */}
      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategoryPie
          title="Receitas por Categoria"
          data={incomeByCat}
          transactions={monthRows.filter((r) => r.type === "income")}
          accent="oklch(0.8 0.16 150)"
          icon={<TrendingUp className="h-6 w-6" />}
          type="income"
        />
        <CategoryPie
          title="Despesas por Categoria"
          data={expenseByCat}
          transactions={monthRows.filter((r) => r.type === "expense")}
          accent="oklch(0.7 0.2 30)"
          icon={<TrendingDown className="h-6 w-6" />}
          type="expense"
        />
      </section>

      <section className="mb-6">
        <EvolutionChart data={rows} year={year} />
      </section>

      {/* Form */}
      <section className="mb-8 max-w-2xl mx-auto">
        <TransactionForm onCreated={load} />
      </section>

      {/* List */}
      <section>
        <h2 className="mb-3 text-base font-bold uppercase tracking-widest text-muted-foreground">
          Lançamentos de {MONTHS_PT[month]}
        </h2>
        <TransactionList rows={monthRows} onDeleted={load} />
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
    <div className="glass rounded-2xl p-6 flex flex-col items-center justify-center text-center transition hover:scale-[1.02] hover:glow min-h-[120px]">
      <div className={`flex items-center gap-2 text-sm opacity-80 uppercase tracking-widest mb-1 ${color}`}>
        {icon} {label}
      </div>
      <div className={`text-3xl font-bold tracking-widest uppercase ${color}`}>
        {fmtCurrency(value)}
      </div>
    </div>
  );
}
