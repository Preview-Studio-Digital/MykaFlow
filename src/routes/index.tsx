import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  const [editIncome, setEditIncome] = useState<TxRow | null>(null);
  const [editExpense, setEditExpense] = useState<TxRow | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  async function load() {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("occurred_on", { ascending: false });
    if (!error && data) setRows(data as TxRow[]);
    setEditIncome(null);
    setEditExpense(null);
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  const monthRows = useMemo(() => {
    // 1. Real rows for this month
    const real = rows.filter((r) => {
      const d = new Date(r.occurred_on + "T00:00:00");
      return d.getFullYear() === year && d.getMonth() === month;
    });

    // 2. Find "Templates": Fixed transactions from ANY month
    // We want the most recent one for each (type, category, description)
    const fixedTemplates = new Map<string, TxRow>();
    const sorted = [...rows].sort(
      (a, b) => new Date(a.occurred_on).getTime() - new Date(b.occurred_on).getTime()
    );

    for (const r of sorted) {
      if (r.nature === "fixed") {
        const key = `${r.type}-${r.category}-${r.description || ""}`;
        fixedTemplates.set(key, r);
      }
    }

    // 3. For each template, if it doesn't exist in 'real' for THIS month, inject it as virtual
    const targetDate = new Date(year, month, 1).toISOString().slice(0, 10);
    const virtual: TxRow[] = [];

    fixedTemplates.forEach((template, key) => {
      const exists = real.some((r) => `${r.type}-${r.category}-${r.description || ""}` === key);
      const templateDate = new Date(template.occurred_on + "T00:00:00");
      const currentMonthDate = new Date(year, month, 1);

      // Only suggest if the template is from a previous or same month
      if (!exists && templateDate <= currentMonthDate) {
        virtual.push({
          ...template,
          id: `virtual-${template.id}`,
          occurred_on: targetDate,
          description: `* ${template.description || ""}`.trim(),
          isVirtual: true,
        });
      }
    });

    return [...real, ...virtual].sort((a, b) => {
      if (a.occurred_on !== b.occurred_on) return b.occurred_on.localeCompare(a.occurred_on);
      return b.created_at.localeCompare(a.created_at);
    });
  }, [rows, year, month]);

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

  const allCategories = useMemo(() => {
    const set = new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]);
    rows.forEach((r) => set.add(r.category));
    return Array.from(set).sort();
  }, [rows]);

  const allDescriptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.description) set.add(r.description.replace(/^\* /, ""));
    });
    return Array.from(set).sort();
  }, [rows]);

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
        <div className="flex items-center gap-3">
          <div className="text-right">
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
          data={expenseByCat}
          accent="oklch(0.7 0.2 30)"
          icon={<TrendingDown className="h-4 w-4" />}
          type="expense"
        />
        <CategoryPie
          title="Receitas por Categoria"
          data={incomeByCat}
          accent="oklch(0.8 0.16 150)"
          icon={<TrendingUp className="h-4 w-4" />}
          type="income"
        />
      </section>

      <section className="mb-6">
        <EvolutionChart data={rows} year={year} />
      </section>

      {/* Forms Section - Revenues and Expenses side by side */}
      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <TransactionForm
            onCreated={load}
            fixedType="expense"
            initialData={editExpense}
            suggestions={allDescriptions}
            categories={allCategories}
          />
        </div>
        <div className="space-y-4">
          <TransactionForm
            onCreated={load}
            fixedType="income"
            initialData={editIncome}
            suggestions={allDescriptions}
            categories={allCategories}
          />
        </div>
      </section>

      {/* List */}
      <section>
        <h2 className="mb-3 text-base font-bold uppercase tracking-widest text-muted-foreground">
          Lançamentos de {MONTHS_PT[month]}
        </h2>
        <TransactionList
          rows={monthRows}
          onDeleted={load}
          onEdit={(row) => {
            if (row.type === "income") {
              setEditIncome(row);
              window.scrollTo({ top: 0, behavior: "smooth" });
            } else {
              setEditExpense(row);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        />
      </section>on>

      <footer className="mt-10 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
        MykaFlow • {new Date().getFullYear()}
      </footer>
    </div>
  );
}

function agg(list: TxRow[]) {
  const map = new Map<string, number>();
  for (const r of list) map.set(r.category, (map.get(r.category) ?? 0) + Number(r.amount));
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
    <div className="glass rounded-2xl p-5 transition hover:scale-[1.02] hover:glow">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
        <span className={color}>{icon}</span>
      </div>
      <p className={`mt-2 text-2xl font-extrabold font-mono ${color}`}>{fmtCurrency(value)}</p>
    </div>
  );
}
