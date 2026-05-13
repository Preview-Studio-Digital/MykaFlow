import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Zap, Lock, Mail, User as UserIcon, Sparkles } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "signin") {
      const { error } = await signIn(email, password);
      if (error) toast.error(error);
      else toast.success("Acesso concedido");
    } else {
      const { error } = await signUp(email, password, name);
      if (error) toast.error(error);
      else toast.success("Conta criada — você é o ADM!");
    }
    setBusy(false);
  }

  return (
    <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/30 blur-3xl pulse-glow" />
      </div>
      <div className="glass w-full max-w-md rounded-2xl p-8 float-up">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2">
            <Zap className="h-8 w-8 text-accent" />
            <h1 className="text-4xl font-extrabold tracking-widest text-gradient">MYKAFLOW</h1>
          </div>
          <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
            {mode === "signin" ? "Acesso seguro" : "Registro ADM"}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "signup" && (
            <Field icon={<UserIcon className="h-4 w-4" />} label="Nome">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-futuristic w-full rounded-lg px-4 py-3 outline-none"
                placeholder="Seu nome"
              />
            </Field>
          )}
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
            {busy ? "..." : mode === "signin" ? "Entrar" : "Registrar ADM"}
          </button>
        </form>

        {/* Opção de criar ADM removida conforme solicitação */}

        <div className="mt-8 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground opacity-50">
            Solicitar acesso ao administrador
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
    <label className="block">
      <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        {icon} {label}
      </span>
      {children}
    </label>
  );
}
