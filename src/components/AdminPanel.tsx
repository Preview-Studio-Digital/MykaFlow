import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { forceCreateUser } from "@/lib/user.control";
import { promoteToAdmin } from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { ShieldCheck, Copy, RefreshCw, UserPlus, ShieldAlert, Users, Mail } from "lucide-react";

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
  const create = useServerFn(forceCreateUser) as any;
  const promote = useServerFn(promoteToAdmin);
  // Removendo listUsers daqui pois já temos a lista principal no AdminPage

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState(genPassword());
  const [busy, setBusy] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ email: string; password: string } | null>(null);

  async function handlePromote() {
    setBusy(true);
    try {
      await promote();
      toast.success("Agora você é ADM! Reiniciando...");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error("Erro ao promover");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // Corrigindo o envio: enviando os dados diretamente, sem o invólucro { data: ... }
      const res = await create({ email, password, displayName: name });
      toast.success(`[V7] RESPOSTA: ${JSON.stringify(res)}`);
      setLastCreated({ email, password });
      setEmail("");
      setName("");
      setPassword(genPassword());
      if (onSuccess) {
        // Pequeno delay para garantir consistência no Supabase antes do refresh
        setTimeout(() => onSuccess(), 500);
      }
    } catch (err: any) {
      console.error("Erro ao criar:", err);
      // Tenta extrair a mensagem do erro se for um Response
      const msg = err instanceof Response ? await err.text() : err.message || "Falha na conexão";
      toast.error(`Erro ao criar usuário: ${msg}`);
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
            className={`text-[10px] px-2 py-0.5 rounded-full border ${isAdmin ? "border-accent text-accent" : role ? "border-red-500 text-red-500" : "border-white/20 text-muted-foreground"}`}
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

        {/* DIAGNÓSTICO: Forçando o formulário a ficar ativo */}
        <form onSubmit={submit} className={`space-y-3`}>
          <input
            required
            placeholder="Nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-futuristic w-full rounded-lg px-3 py-2 outline-none"
          />
          <input
            required
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-futuristic w-full rounded-lg px-3 py-2 outline-none"
          />
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
