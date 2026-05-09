import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { AdminPanel } from "@/components/AdminPanel";
import { IdentifierManager } from "@/components/IdentifierManager";
import { supabase } from "@/integrations/supabase/client";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/finance-constants";
import { type TxRow } from "@/components/TransactionList";
import { ChevronLeft, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { user, loading, role } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<TxRow[]>([]);

  async function load() {
    const { data } = await supabase.from("transactions").select("*");
    if (data) setRows(data as TxRow[]);
  }

  useEffect(() => {
    if (user && role === "admin") load();
  }, [user, role]);

  const expenseCats = useMemo(() => {
    const set = new Set([...EXPENSE_CATEGORIES]);
    rows.filter(r => r.type === "expense").forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set).sort();
  }, [rows]);

  const incomeCats = useMemo(() => {
    const set = new Set([...INCOME_CATEGORIES]);
    rows.filter(r => r.type === "income").forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set).sort();
  }, [rows]);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate({ to: "/login" });
      } else if (role !== "admin") {
        navigate({ to: "/" });
      }
    }
  }, [loading, user, role, navigate]);

  if (loading || !user || role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="relative z-10 min-h-screen px-4 py-8 md:px-8 max-w-4xl mx-auto">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/" })}
            className="btn-ghost-neon rounded-lg p-2"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold tracking-widest text-gradient flex items-center gap-2">
              <ShieldCheck className="h-6 w-6" /> ADMINISTRADOR
            </h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Gestão de acessos e equipe
            </p>
          </div>
        </div>
      </header>

      <main className="space-y-6">
        <AdminPanel />
        <IdentifierManager expenseCats={expenseCats} incomeCats={incomeCats} onUpdated={load} />
      </main>

      <footer className="mt-10 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
        MykaFlow • {new Date().getFullYear()}
      </footer>
    </div>
  );
}
