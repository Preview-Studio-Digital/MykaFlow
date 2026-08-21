import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { ShieldCheck, RefreshCw, ShieldAlert } from "lucide-react";

function genPassword(len = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let p = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) p += chars[arr[i] % chars.length];
  return p;
}

export function AdminPanel({ onSuccess }: { onSuccess?: () => void }) {
  const { user, role, fetchRole } = useAuth();
  const isAdmin = role === "admin";

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleOption, setRoleOption] = useState<"admin" | "financeiro" | "crm">("crm");
  const [password, setPassword] = useState(genPassword());
  const [busy, setBusy] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ email: string; password: string } | null>(null);

  async function handlePromote() {
    if (!user) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("user_roles")
        .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id" });

      if (error) throw error;

      toast.success("Agora você é ADM! Atualizando...");
      await fetchRole();
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      toast.error(`Erro ao promover: ${err.message || "Falha"}`);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name },
        },
      });

      if (authError) throw authError;

      if (authData.user) {
        await supabase.from("profiles").upsert({
          id: authData.user.id,
          display_name: name.toUpperCase(),
          email: email,
        });

        await supabase.from("user_roles").upsert(
          {
            user_id: authData.user.id,
            role: roleOption,
          },
          { onConflict: "user_id" },
        );
      }

      toast.success("Usuário criado com sucesso!");
      setLastCreated({ email, password });
      setEmail("");
      setName("");
      setPassword(genPassword());
      if (onSuccess) {
        setTimeout(() => onSuccess(), 500);
      }
    } catch (err: any) {
      console.error("Erro ao criar:", err);
      toast.error(`Erro ao criar usuário: ${err.message || "Falha na conexão"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-bold tracking-widest text-gradient flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Painel ADM
          </div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              isAdmin
                ? "border-accent text-accent"
                : role
                  ? "border-red-500 text-red-500"
                  : "border-white/20 text-muted-foreground"
            }`}
          >
            {role?.toUpperCase() || "CARREGANDO..."}
          </span>
        </h3>

        {role !== "admin" && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 space-y-3">
            <div className="flex items-center gap-2 text-red-500">
              <ShieldAlert className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-widest">Acesso Restrito</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Você precisa ser Administrador para gerenciar a equipe.
            </p>
            <button
              onClick={handlePromote}
              disabled={busy}
              className="w-full py-2 bg-red-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest"
            >
              {busy ? "Processando..." : "Tornar-me Administrador"}
            </button>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <input
            required
            placeholder="Nome Completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-futuristic w-full rounded-lg px-3 py-2 outline-none uppercase font-bold"
          />
          <input
            required
            type="email"
            placeholder="E-mail de Acesso"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-futuristic w-full rounded-lg px-3 py-2 outline-none font-mono"
          />
          <select
            value={roleOption}
            onChange={(e) => setRoleOption(e.target.value as any)}
            className="input-futuristic w-full rounded-lg px-3 py-2 outline-none bg-black/80 font-bold uppercase text-xs cursor-pointer"
          >
            <option value="admin" className="bg-slate-900 font-bold text-accent">
              ADMINISTRADOR
            </option>
            <option value="financeiro" className="bg-slate-900 font-bold text-emerald-400">
              FINANCEIRO
            </option>
            <option value="crm" className="bg-slate-900 font-bold text-sky-400">
              COMERCIAL
            </option>
          </select>
          <div className="flex gap-2">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-futuristic flex-1 rounded-lg px-3 py-2 font-mono text-xs outline-none"
            />
            <button
              type="button"
              onClick={() => setPassword(genPassword())}
              className="btn-ghost-neon px-2 rounded-lg"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <button
            disabled={busy}
            type="submit"
            className="btn-futuristic w-full rounded-lg py-3 text-xs uppercase font-bold"
          >
            {busy ? "Criando..." : "Criar Acesso"}
          </button>
        </form>

        {lastCreated && (
          <div className="p-3 rounded-lg bg-accent/10 border border-accent/30 text-[10px] font-mono">
            <p className="text-accent uppercase mb-1">Sucesso!</p>
            <p>
              {lastCreated.email} / {lastCreated.password}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
