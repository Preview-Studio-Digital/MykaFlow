import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import {
  Wallet,
  Users2,
  ShieldCheck,
  LogOut,
  User as UserIcon,
  ChevronDown,
  Building2,
} from "lucide-react";
import { useState } from "react";

interface AppHeaderProps {
  onOpenProfile?: () => void;
}

export function AppHeader({ onOpenProfile }: AppHeaderProps) {
  const { user, role, signOut } = useAuth();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const isAdmin = role === "admin";
  const canAccessFinance = isAdmin || role === "financeiro" || role === "user";
  const canAccessCrm = isAdmin || role === "crm" || role === "crm_vendedor" || role === "crm_gestor" || role === "user";

  const isFinanceActive = currentPath === "/" || currentPath.startsWith("/financeiro");
  const isCrmActive = currentPath.startsWith("/crm");
  const isAdminActive = currentPath.startsWith("/admin");

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        {/* Brand & Module Switcher */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold shadow-md shadow-emerald-500/20">
              M
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-foreground flex items-center gap-1.5">
                MykaFlow
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50">
                  Pro
                </span>
              </span>
              <span className="text-[11px] text-muted-foreground font-medium">
                Gestão Financeira & Comercial
              </span>
            </div>
          </div>

          {/* Module Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-1">
            {canAccessFinance && (
              <Link
                to="/"
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  isFinanceActive
                    ? "bg-background text-foreground shadow-sm shadow-black/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                }`}
              >
                <Wallet className={`h-3.5 w-3.5 ${isFinanceActive ? "text-emerald-500" : ""}`} />
                Financeiro
              </Link>
            )}

            {canAccessCrm && (
              <Link
                to="/crm"
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  isCrmActive
                    ? "bg-background text-foreground shadow-sm shadow-black/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                }`}
              >
                <Users2 className={`h-3.5 w-3.5 ${isCrmActive ? "text-blue-500" : ""}`} />
                Comercial & Vendas
              </Link>
            )}

            {isAdmin && (
              <Link
                to="/admin"
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  isAdminActive
                    ? "bg-background text-foreground shadow-sm shadow-black/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                }`}
              >
                <ShieldCheck className={`h-3.5 w-3.5 ${isAdminActive ? "text-amber-500" : ""}`} />
                Administração
              </Link>
            )}
          </nav>
        </div>

        {/* User Actions */}
        <div className="flex items-center gap-3">
          {/* Mobile Module Nav Links */}
          <div className="flex md:hidden items-center gap-1">
            {canAccessFinance && (
              <Link
                to="/"
                className={`p-2 rounded-lg text-xs ${isFinanceActive ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                title="Financeiro"
              >
                <Wallet className="h-4 w-4" />
              </Link>
            )}
            {canAccessCrm && (
              <Link
                to="/crm"
                className={`p-2 rounded-lg text-xs ${isCrmActive ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                title="Comercial"
              >
                <Users2 className="h-4 w-4" />
              </Link>
            )}
          </div>

          {user && (
            <div className="flex items-center gap-2 border-l border-border/40 pl-3">
              <button
                onClick={onOpenProfile}
                className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-accent/50 text-left transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20">
                  <UserIcon className="h-4 w-4" />
                </div>
                <div className="hidden lg:flex flex-col text-left">
                  <span className="text-xs font-medium text-foreground max-w-[120px] truncate">
                    {user.user_metadata?.display_name || user.email?.split("@")[0]}
                  </span>
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {role === "admin" ? "Administrador" : role || "Usuário"}
                  </span>
                </div>
              </button>

              <button
                onClick={() => signOut()}
                className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                title="Sair da Conta"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
