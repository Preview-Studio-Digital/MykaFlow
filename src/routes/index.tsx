import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Wallet,
  Users2,
  ShieldCheck,
  LogOut,
  ArrowRight,
  TrendingUp,
  BarChart3,
  CheckCircle,
  Sparkles,
  ChevronRight,
  User as UserIcon,
} from "lucide-react";
import { ProfileDialog } from "@/components/ProfileDialog";

export const Route = createFileRoute("/")({
  component: ModuleHub,
});

function ModuleHub() {
  const { user, loading, role, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase animate-pulse">
            Carregando MykaFlow...
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const isAdmin = role === "admin";
  const canAccessFinance = isAdmin || role === "financeiro" || role === "user";
  const canAccessCrm = isAdmin || role === "crm" || role === "crm_vendedor" || role === "crm_gestor" || role === "user";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-muted/20 text-foreground flex flex-col justify-between">
      {/* Top Bar */}
      <header className="w-full px-6 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center">
          <img
            src="/logo-myka.ico"
            alt="Logo MykaFlow"
            className="h-8 md:h-9 w-auto max-w-[200px] object-contain object-left drop-shadow-[0_0_15px_rgba(34,211,238,0.35)] hover:scale-105 transition-transform"
          />
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              to="/admin"
              className="p-2 rounded-lg border border-border/60 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Painel de Administração"
            >
              <ShieldCheck className="h-4 w-4" />
            </Link>
          )}

          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
            className="p-2 rounded-lg border border-border/60 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            title="Sair do Sistema"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Selection Area */}
      <main className="max-w-5xl w-full mx-auto px-6 py-8 flex-1 flex flex-col justify-center items-center">
        <div className="text-center mx-auto mb-12 select-none">
          <h1 className="font-saira-stencil text-5xl sm:text-7xl font-bold tracking-[0.15em] text-cyan-400 drop-shadow-[0_0_30px_rgba(34,211,238,0.45)] uppercase">
            MYKAFLOW
          </h1>
        </div>

        {/* 2 Main Module Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
          {/* Card 1: FINANCEIRO */}
          <div
            onClick={() => canAccessFinance && navigate({ to: "/financeiro" })}
            className={`group relative overflow-hidden rounded-2xl border p-8 transition-all flex flex-col justify-between ${
              canAccessFinance
                ? "border-border/60 bg-card hover:border-emerald-500/50 hover:shadow-2xl hover:shadow-emerald-500/10 cursor-pointer hover:-translate-y-1"
                : "border-border/20 bg-muted/20 opacity-60 cursor-not-allowed"
            }`}
          >
            <div className="absolute top-0 right-0 h-32 w-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/15 transition-colors" />

            <div className="space-y-4 relative z-10">
              <div className="flex items-center justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 group-hover:scale-110 transition-transform">
                  <Wallet className="h-7 w-7" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Módulo Financeiro
                </span>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-foreground group-hover:text-emerald-400 transition-colors">
                  Financeiro & Caixa
                </h3>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Controle total de fluxo de caixa, DRE, métricas operacionais, gráficos de evolução e conciliação bancária.
                </p>
              </div>

              <ul className="space-y-2 pt-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500/80" />
                  Lançamento de receitas e despesas
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500/80" />
                  Diária empresarial e hora operacional
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500/80" />
                  Previsão e recebíveis automáticos
                </li>
              </ul>
            </div>

            <div className="pt-8 relative z-10">
              <button
                disabled={!canAccessFinance}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/20 group-hover:gap-3"
              >
                Acessar Financeiro
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Card 2: CRM & VENDAS */}
          <div
            onClick={() => canAccessCrm && navigate({ to: "/crm" })}
            className={`group relative overflow-hidden rounded-2xl border p-8 transition-all flex flex-col justify-between ${
              canAccessCrm
                ? "border-border/60 bg-card hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10 cursor-pointer hover:-translate-y-1"
                : "border-border/20 bg-muted/20 opacity-60 cursor-not-allowed"
            }`}
          >
            <div className="absolute top-0 right-0 h-32 w-32 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/15 transition-colors" />

            <div className="space-y-4 relative z-10">
              <div className="flex items-center justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20 group-hover:scale-110 transition-transform">
                  <Users2 className="h-7 w-7" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Módulo Comercial
                </span>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-foreground group-hover:text-blue-400 transition-colors">
                  CRM & Vendas
                </h3>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Funil de vendas, cadastro de clientes, acompanhamento de orçamentos e fechamento integrado ao caixa.
                </p>
              </div>

              <ul className="space-y-2 pt-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-500/80" />
                  Funil de vendas visual e interativo
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-500/80" />
                  Acompanhamento de orçamentos
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-500/80" />
                  Lançamento automático de contratos no fluxo
                </li>
              </ul>
            </div>

            <div className="pt-8 relative z-10">
              <button
                disabled={!canAccessCrm}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/20 group-hover:gap-3"
              >
                Acessar CRM
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer info */}
      <footer className="w-full text-center py-4 text-xs text-muted-foreground border-t border-border/20">
        MykaFlow Sistema Integrado de Gestão &bull; Financeiro + CRM
      </footer>
    </div>
  );
}
