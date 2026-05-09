import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { AdminPanel } from "@/components/AdminPanel";
import { ChevronLeft, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { user, loading, role } = useAuth();
  const navigate = useNavigate();

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
      </main>

      <footer className="mt-10 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
        MykaFlow • {new Date().getFullYear()}
      </footer>
    </div>
  );
}
