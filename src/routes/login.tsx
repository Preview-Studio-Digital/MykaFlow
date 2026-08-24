import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Zap, Lock, Mail } from "lucide-react";
import { MYKAFLOW_LOGO_DATA_URI } from "@/assets/logo";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    console.log("Login: Tentando...", { email });
    try {
      const { error } = await signIn(email, password);
      if (error) {
        console.error("Login Error:", error);
        toast.error("Erro no login: " + error);
      } else {
        toast.success("Acesso concedido");
      }
    } catch (err: any) {
      console.error("Fatal Error:", err);
      toast.error("Erro fatal: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/30 blur-3xl pulse-glow" />
      </div>
      <div className="glass w-full max-w-md rounded-2xl p-8 float-up">
        <div className="mb-8 flex flex-col items-center justify-center text-center">
          <img
            src={MYKAFLOW_LOGO_DATA_URI}
            alt="MykaFlow"
            className="h-10 sm:h-12 w-auto max-w-[260px] object-contain drop-shadow-[0_0_25px_rgba(34,211,238,0.4)] select-none"
          />
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field icon={<Mail className="h-4 w-4" />} label="E-mail">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-futuristic w-full rounded-lg px-4 py-3 outline-none"
              placeholder="email@empresa.com"
            />
          </Field>
          <Field icon={<Lock className="h-4 w-4" />} label="Senha">
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-futuristic w-full rounded-lg px-4 py-3 outline-none"
              placeholder="••••••••"
            />
          </Field>

          <button
            disabled={busy}
            type="submit"
            className="btn-futuristic w-full rounded-lg px-6 py-3 text-sm font-bold disabled:opacity-50"
          >
            {busy ? "..." : "Entrar"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground opacity-50">
            Acesso exclusivo para funcionários autorizados
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}
