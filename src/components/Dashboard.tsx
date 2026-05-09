import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { TransactionForm } from "@/components/TransactionForm";
import { TransactionList, type TxRow } from "@/components/TransactionList";
import { CategoryPie } from "@/components/CategoryPie";
import { EvolutionChart } from "@/components/EvolutionChart";
import { DailyChart } from "@/components/DailyChart";
import { fmtCurrency, MONTHS_PT } from "@/lib/finance-constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LogOut,
  Zap,
  TrendingUp,
  TrendingDown,
  Wallet,
  Plus,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

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
    <div className="glass group relative overflow-hidden rounded-2xl p-5 transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-primary/20 border border-white/5">
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/5 blur-2xl transition-all group-hover:bg-primary/10" />
      <div className="flex items-center gap-4">
        <div className={`rounded-xl bg-white/5 p-3 ${color} glow`}>{icon}</div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {label}
          </p>
          <p className={`text-xl font-black tracking-tighter ${color}`}>
            {fmtCurrency(value)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { user, loading, signOut, role } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) load();
  }, [user]);

  async function load() {
    const { data } = await supabase.from("transactions").select("*").order("occurred_on", { ascending: false });
    if (data) setRows(data as TxRow[]);
  }

  const monthRows = useMemo(() => {
    return rows.filter((r) => {
      const dateStr = r.occurred_on.includes("T") ? r.occurred_on : `${r.occurred_on}T00:00:00`;
      const d = new Date(dateStr);
      return !isNaN(d.getTime()) && d.getMonth() === month && d.getFullYear() === year;
    });
  }, [rows, month, year]);

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

  const expenseCats = useMemo(() => {
    const set = new Set<string>();
    rows.filter(r => r.type === "expense").forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set).sort();
  }, [rows]);

  const incomeCats = useMemo(() => {
    const set = new Set<string>();
    rows.filter(r => r.type === "income").forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set).sort();
  }, [rows]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground bg-[#0a0c14]">
        Carregando...
      </div>
    );
  }

  return (
    <div className="relative z-10 min-h-screen px-4 py-8 md:px-8 bg-[#0a0c14] text-white">
      <div className="absolute inset-0 -z-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
      
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
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {role === "admin" ? "Administrador" : "Funcionário"}
            </p>
            <p className="text-sm font-mono">{user.email}</p>
          </div>
          {role === "admin" && (
            <button
              onClick={() => navigate({ to: "/admin" })}
              className="btn-ghost-neon rounded-lg px-4 py-2 text-xs flex items-center gap-2"
            >
              <ShieldCheck className="h-4 w-4" /> Admin
            </button>
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
        <div className="glass rounded-2xl p-5 flex items-center justify-between md:col-span-1">
          <button onClick={() => shiftMonth(-1)} className="btn-ghost-neon rounded-lg p-2">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Período</p>
            <p className="text-lg font-bold tracking-widest text-gradient">
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
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <Kpi
          label="Despesas"
          value={totalExpense}
          color="text-destructive"
          icon={<TrendingDown className="h-5 w-5" />}
        />
        <Kpi
          label="Saldo"
          value={balance}
          color={balance >= 0 ? "text-accent" : "text-destructive"}
          icon={<Wallet className="h-5 w-5" />}
        />
      </section>

      {/* Charts */}
      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategoryPie
          title="Despesas por Categoria"
          rows={monthRows}
          accent="oklch(0.7 0.2 30)"
          icon={<TrendingDown className="h-4 w-4" />}
          type="expense"
        />
        <CategoryPie
          title="Receitas por Categoria"
          rows={monthRows}
          accent="oklch(0.8 0.16 150)"
          icon={<TrendingUp className="h-4 w-4" />}
          type="income"
        />
      </section>

      <section className="mb-6">
        <EvolutionChart data={rows} year={year} />
      </section>

      <section className="mb-6">
        <DailyChart rows={monthRows} month={month} year={year} />
      </section>

      {/* Forms Section */}
      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4" /> Despesas
            </h2>
            <button
              onClick={() => setIsFormOpen(true)}
              className="btn-futuristic rounded-lg px-4 py-2 text-xs font-bold flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Novo Lançamento
            </button>
          </div>
          <TransactionList
            rows={monthRows.filter((r) => r.type === "expense")}
            onUpdated={load}
          />
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Receitas
            </h2>
          </div>
          <TransactionList
            rows={monthRows.filter((r) => r.type === "income")}
            onUpdated={load}
          />
        </div>
      </section>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="glass border-white/10 bg-[#0a0c14]/95 text-white backdrop-blur-xl sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-gradient text-xl font-bold uppercase tracking-widest">
              Novo Lançamento
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <TransactionForm
              onCreated={() => {
                load();
                setIsFormOpen(false);
              }}
              type="expense"
              categories={expenseCats}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
