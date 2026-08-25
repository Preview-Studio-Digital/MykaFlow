import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { ShieldCheck, RefreshCw, ShieldAlert, UserPlus, X } from "lucide-react";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://rbrqcncojnzmvebtznaf.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJicnFjbmNvam56bXZlYnR6bmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5Nzg2MTYsImV4cCI6MjA5MzkxOTk1MH0.AJArYP7yHBiNu8GgxZYl4Bcga378drJMK75i32zvQAs";

// Cliente isolado com persistSession: false para não desconectar/sobrescrever o Administrador logado
const isolatedAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

function genPassword(len = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let p = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) p += chars[arr[i] % chars.length];
  return p;
}

export function AdminPanel({ onSuccess, onCancel }: { onSuccess?: () => void; onCancel?: () => void }) {
  const { user, role, fetchRole } = useAuth();
  const isAdmin = role === "admin";

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleOption, setRoleOption] = useState<"admin" | "financeiro" | "crm">("crm");
  const [password, setPassword] = useState(genPassword());
  const [busy, setBusy] = useState(false);

  async function handlePromote() {
    if (!user) return;
    setBusy(true);
    try {
      await supabase.from("user_roles").delete().eq("user_id", user.id);
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: user.id, role: "admin" });

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
    if (!name.trim() || !email.trim()) {
      return toast.error("Preencha todos os campos obrigatórios.");
    }
    setBusy(true);
    try {
      // 1. Criar credenciais no Supabase Auth sem alterar a sessão do Administrador
      const { data: authData, error: authError } = await isolatedAuthClient.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { display_name: name.trim().toUpperCase() },
        },
      });

      if (authError) {
        if (
          authError.message?.toLowerCase().includes("already registered") ||
          authError.message?.toLowerCase().includes("already exists") ||
          (authError as any).code === "user_already_exists"
        ) {
          try {
            await supabase.rpc("sync_auth_users_to_profiles");
          } catch (e) {}

          toast.info(`O e-mail ${email.trim().toLowerCase()} já possui cadastro prévio. Sincronizando equipe...`);
          setEmail("");
          setName("");
          setPassword(genPassword());
          if (onSuccess) onSuccess();
          return;
        }
        throw authError;
      }

      if (authData?.user && authData.user.identities && authData.user.identities.length === 0) {
        try {
          await supabase.rpc("sync_auth_users_to_profiles");
        } catch (e) {}

        toast.info(`O e-mail ${email.trim().toLowerCase()} já possui cadastro prévio. Sincronizando equipe...`);
        setEmail("");
        setName("");
        setPassword(genPassword());
        if (onSuccess) onSuccess();
        return;
      }

      // Mapeia a opção selecionada para o enum válido do banco: 'admin' | 'financeiro' | 'user'
      const dbRole = roleOption === "admin" ? "admin" : roleOption === "financeiro" ? "financeiro" : "user";

      // 2. Gravar perfil e permissão utilizando o cliente autenticado do Administrador
      if (authData.user) {
        const newUserId = authData.user.id;

        const { error: profError } = await supabase.from("profiles").upsert(
          {
            id: newUserId,
            display_name: name.trim().toUpperCase(),
            email: email.trim().toLowerCase(),
          },
          { onConflict: "id" }
        );
        if (profError) {
          console.warn("Aviso ao gravar profile:", profError);
        }

        await supabase.from("user_roles").delete().eq("user_id", newUserId);
        const { error: roleError } = await supabase.from("user_roles").insert({
          user_id: newUserId,
          role: dbRole,
        });
        if (roleError) {
          console.warn("Aviso ao gravar user_roles:", roleError);
        }
      }

      toast.success(`Novo usuário ${name.trim().toUpperCase()} criado com sucesso!`);
      setEmail("");
      setName("");
      setPassword(genPassword());

      // Retorna imediatamente para a tela de equipe
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error("Erro ao criar usuário:", err);
      toast.error(`Erro ao criar usuário: ${err.message || "Falha na conexão"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-6 border border-sky-400/30 bg-slate-950/80 backdrop-blur-xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 text-white">
            <div className="p-1.5 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-400">
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Cadastrar Novo Membro
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Crie um novo acesso para a equipe sem deslogar da sua conta.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full border ${
                isAdmin
                  ? "border-sky-400 text-sky-300 bg-sky-500/15"
                  : role
                    ? "border-red-500 text-red-500 bg-red-500/10"
                    : "border-white/20 text-muted-foreground"
              }`}
            >
              ADM LOGADO: {user?.email}
            </span>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="btn-ghost-neon p-1.5 rounded-lg text-muted-foreground hover:text-white cursor-pointer"
                title="Fechar formulário"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

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
              className="w-full py-2 bg-red-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest cursor-pointer"
            >
              {busy ? "Processando..." : "Tornar-me Administrador"}
            </button>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
              Nome Completo do Usuário
            </label>
            <input
              required
              placeholder="Ex: JOÃO SILVA"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-futuristic w-full rounded-xl px-3 py-2.5 outline-none uppercase font-bold text-xs"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
              E-mail de Acesso
            </label>
            <input
              required
              type="email"
              placeholder="joao@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-futuristic w-full rounded-xl px-3 py-2.5 outline-none font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Perfil de Permissão
              </label>
              <select
                value={roleOption}
                onChange={(e) => setRoleOption(e.target.value as any)}
                className="input-futuristic w-full rounded-xl px-3 py-2.5 outline-none bg-black/80 font-bold uppercase text-xs cursor-pointer"
              >
                <option value="crm" className="bg-slate-900 font-bold text-sky-400">
                  COMERCIAL
                </option>
                <option value="financeiro" className="bg-slate-900 font-bold text-emerald-400">
                  FINANCEIRO
                </option>
                <option value="admin" className="bg-slate-900 font-bold text-accent">
                  ADMINISTRADOR
                </option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Senha Provisória
              </label>
              <div className="flex gap-2">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-futuristic flex-1 rounded-xl px-3 py-2.5 font-mono text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={() => setPassword(genPassword())}
                  className="btn-ghost-neon px-3 rounded-xl flex items-center gap-1 text-xs cursor-pointer"
                  title="Gerar nova senha"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="btn-ghost-neon px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Cancelar
              </button>
            )}
            <button
              disabled={busy}
              type="submit"
              className="btn-futuristic px-6 py-2.5 rounded-xl text-xs uppercase font-black text-slate-950 flex items-center gap-1.5 shadow-lg shadow-sky-400/20 cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>{busy ? "Criando Usuário..." : "Criar Acesso"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
