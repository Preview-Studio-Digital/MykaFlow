import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { useEffect, useRef } from "react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você está procurando não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao Início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Falha ao carregar a página
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ocorreu um erro inesperado. Tente recarregar ou voltar ao início.
        </p>
        {error?.message && (
          <div className="mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono text-left max-h-40 overflow-auto">
            {error.message}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar ao Início
          </a>
        </div>
      </div>
    </div>
  );
}

function ScrollDirectionListener() {
  const lastScrollY = useRef(0);
  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > lastScrollY.current) {
        document.documentElement.setAttribute("data-scroll-dir", "down");
      } else if (currentScrollY < lastScrollY.current) {
        document.documentElement.setAttribute("data-scroll-dir", "up");
      }
      lastScrollY.current = currentScrollY;

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        document.documentElement.setAttribute("data-scroll-dir", "static");
      }, 200);
    };

    document.documentElement.setAttribute("data-scroll-dir", "static");
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return null;
}

import { useAuth } from "@/lib/auth-context";
import { IS_NETWORK_RESTRICTION_ENABLED } from "@/lib/network-security";
import { ShieldAlert, RefreshCw, LogOut, WifiOff } from "lucide-react";

function NetworkSecurityGuard({ children }: { children: React.ReactNode }) {
  const { user, role, isNetworkAllowed, clientIp, signOut, refreshNetworkSecurity, loading } = useAuth();

  // Se a restrição de rede estiver desabilitada, carregando, sem usuário, admin ou autorizada -> libera acesso
  if (!IS_NETWORK_RESTRICTION_ENABLED || loading || !user || role === "admin" || isNetworkAllowed) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-white">
      <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900/90 p-8 text-center shadow-2xl backdrop-blur-2xl space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.3)]">
          <WifiOff className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-black uppercase tracking-wider text-white">
            Acesso Restrito à Empresa
          </h1>
          <p className="text-xs text-slate-300 leading-relaxed">
            O MykaFlow está configurado para uso exclusivo nas dependências da empresa. Conecte-se ao Wi-Fi ou rede corporativa para continuar.
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-black/60 border border-white/10 text-xs space-y-1.5 font-mono">
          <div className="flex justify-between text-muted-foreground">
            <span>Seu IP Detectado:</span>
            <span className="text-rose-400 font-bold">{clientIp}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Usuário:</span>
            <span className="text-white font-bold truncate max-w-[180px]">
              {user.user_metadata?.display_name || user.email}
            </span>
          </div>
          <p className="text-[10px] text-amber-400/90 pt-1 border-t border-white/5">
            🚨 Uma notificação com data, hora e IP foi registrada para o Administrador.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => refreshNetworkSecurity()}
            className="btn-futuristic w-full rounded-xl py-2.5 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Já conectei à rede da empresa</span>
          </button>

          <button
            type="button"
            onClick={() => signOut()}
            className="btn-ghost-neon w-full rounded-xl py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-white flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Desconectar Conta</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NetworkSecurityGuard>
          <ScrollDirectionListener />
          <Outlet />
          <Toaster theme="dark" position="top-right" />
        </NetworkSecurityGuard>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});
