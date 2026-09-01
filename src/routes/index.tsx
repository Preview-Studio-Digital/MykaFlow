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
import { MYKAFLOW_LOGO_DATA_URI, MYKA_COMPRESSORES_LOGO_DATA_URI } from "@/assets/logo";

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
  const isFinanceiro = role === "financeiro";
  const canAccessFinance = isAdmin || isFinanceiro;
  const canAccessCrm = isAdmin || isFinanceiro || role === "crm" || role === "crm_vendedor" || role === "crm_gestor" || role === "user";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-muted/20 text-foreground flex flex-col justify-between">
      {/* Top Bar - Logo Myka Compressores no canto superior esquerdo */}
      <header className="w-full px-6 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center">
          <img
            src={MYKA_COMPRESSORES_LOGO_DATA_URI}
            alt="Logo Myka Compressores"
            className="h-8 md:h-9 w-auto max-w-[220px] object-contain object-left drop-shadow-[0_0_15px_rgba(34,211,238,0.35)] select-none"
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
        <div className="text-center mx-auto mb-8 select-none flex items-center justify-center">
          <img
            src={MYKAFLOW_LOGO_DATA_URI}
            alt="MykaFlow"
            className="h-9 sm:h-12 md:h-14 w-auto max-w-[70vw] object-contain drop-shadow-[0_0_25px_rgba(34,211,238,0.35)] select-none"
          />
        </div>

        {/* 2 Main Module Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
          {/* Card 1: FINANCEIRO */}
          <div
            onClick={() => canAccessFinance && navigate({ to: "/financeiro" })}
            className={`group relative overflow-hidden rounded-3xl border p-8 transition-all duration-300 flex flex-col justify-between select-none ${
              canAccessFinance
                ? "border-border/60 bg-card/80 hover:border-emerald-500/60 hover:shadow-[0_0_35px_rgba(16,185,129,0.2)] cursor-pointer hover:scale-[1.02] active:scale-[0.99] backdrop-blur-xl"
                : "border-border/20 bg-muted/20 opacity-60 cursor-not-allowed"
            }`}
          >
            <div className="absolute top-0 right-0 h-40 w-40 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all duration-300" />

            <div className="space-y-5 relative z-10">
              <div className="flex items-center justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-110 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/40 shadow-sm transition-all duration-300">
                  <Wallet className="h-7 w-7" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 group-hover:border-emerald-500/50 transition-colors">
                  Módulo Financeiro
                </span>
              </div>

              <div>
                <h3 className="text-2xl font-black uppercase tracking-wider text-foreground group-hover:text-emerald-400 transition-colors">
                  GESTÃO FINANCEIRA
                </h3>
              </div>

              <ul className="space-y-2.5 pt-1 text-xs text-muted-foreground font-medium">
                <li className="flex items-center gap-2.5 group-hover:text-slate-200 transition-colors">
                  <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                  Fluxo de Caixa e DRE em Tempo Real
                </li>
                <li className="flex items-center gap-2.5 group-hover:text-slate-200 transition-colors">
                  <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                  Controle de Receitas, Despesas e Prazos
                </li>
                <li className="flex items-center gap-2.5 group-hover:text-slate-200 transition-colors">
                  <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                  Métricas Operacionais e Conciliação
                </li>
              </ul>
            </div>
          </div>

          {/* Card 2: GESTÃO DE ATIVIDADES */}
          <div
            onClick={() => canAccessCrm && navigate({ to: "/crm" })}
            className={`group relative overflow-hidden rounded-3xl border p-8 transition-all duration-300 flex flex-col justify-between select-none ${
              canAccessCrm
                ? "border-border/60 bg-card/80 hover:border-sky-500/60 hover:shadow-[0_0_35px_rgba(56,189,248,0.2)] cursor-pointer hover:scale-[1.02] active:scale-[0.99] backdrop-blur-xl"
                : "border-border/20 bg-muted/20 opacity-60 cursor-not-allowed"
            }`}
          >
            <div className="absolute top-0 right-0 h-40 w-40 bg-sky-500/5 rounded-full blur-3xl group-hover:bg-sky-500/20 transition-all duration-300" />

            <div className="space-y-5 relative z-10">
              <div className="flex items-center justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 group-hover:scale-110 group-hover:bg-sky-500/20 group-hover:border-sky-500/40 shadow-sm transition-all duration-300">
                  <Users2 className="h-7 w-7" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/25 group-hover:border-sky-500/50 transition-colors">
                  Módulo Comercial
                </span>
              </div>

              <div>
                <h3 className="text-2xl font-black uppercase tracking-wider text-foreground group-hover:text-sky-400 transition-colors">
                  GESTÃO COMERCIAL
                </h3>
              </div>

              <ul className="space-y-2.5 pt-1 text-xs text-muted-foreground font-medium">
                <li className="flex items-center gap-2.5 group-hover:text-slate-200 transition-colors">
                  <CheckCircle className="h-4 w-4 text-sky-400 shrink-0" />
                  Atividades Individuais
                </li>
                <li className="flex items-center gap-2.5 group-hover:text-slate-200 transition-colors">
                  <CheckCircle className="h-4 w-4 text-sky-400 shrink-0" />
                  Acompanhamento de Fluxo
                </li>
                <li className="flex items-center gap-2.5 group-hover:text-slate-200 transition-colors">
                  <CheckCircle className="h-4 w-4 text-sky-400 shrink-0" />
                  Produtividade & Eficiência
                </li>
                <li className="flex items-center gap-2.5 group-hover:text-slate-200 transition-colors">
                  <CheckCircle className="h-4 w-4 text-sky-400 shrink-0" />
                  Automação Financeira
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Footer info */}
      <footer className="w-full text-center py-4 px-4 text-xs text-muted-foreground border-t border-border/20 select-none flex items-center justify-center">
        <span className="text-[11px] font-medium text-slate-400">
          Desenvolvido por{" "}
          <a
            href="https://www.previewstudio.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 font-bold transition-colors hover:underline"
          >
            Preview Studio Digital
          </a>
        </span>
      </footer>
    </div>
  );
}
