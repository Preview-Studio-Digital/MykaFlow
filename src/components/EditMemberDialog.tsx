import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  getUserSalaryConfig,
  saveUserSalaryConfig,
  computeHourlyRate,
} from "@/lib/salary-cost-tracker";
import {
  User,
  X,
  Save,
  Mail,
  UserCircle,
  ShieldCheck,
  Wallet,
  Users2,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Copy,
  DollarSign,
  Calculator,
} from "lucide-react";

export interface MemberProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface EditMemberDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: MemberProfile | null;
  onSuccess: () => void;
}

function genPassword(len = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let p = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) p += chars[arr[i] % chars.length];
  return p;
}

function formatBRL(value: number): string {
  if (!value && value !== 0) return "";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseBRL(text: string): number {
  const clean = text.replace(/\D/g, "");
  if (!clean) return 0;
  return Number(clean) / 100;
}

export function EditMemberDialog({
  isOpen,
  onClose,
  targetUser,
  onSuccess,
}: EditMemberDialogProps) {
  const { user: currentUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "financeiro" | "crm">("crm");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [baseSalary, setBaseSalary] = useState<number>(0);
  const [salaryDisplay, setSalaryDisplay] = useState<string>("");
  const [chargesMultiplier, setChargesMultiplier] = useState<number>(1.0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (targetUser) {
      setName(targetUser.name || "");
      setEmail(targetUser.email || "");
      setPassword("");
      setShowPassword(false);
      const r = targetUser.role;
      if (r === "admin") setRole("admin");
      else if (r === "financeiro") setRole("financeiro");
      else setRole("crm");

      // Carregar configurações de salário e multiplicador de encargos
      const salaryCfg = getUserSalaryConfig(targetUser.id);
      setBaseSalary(salaryCfg.baseSalary);
      setSalaryDisplay(salaryCfg.baseSalary > 0 ? formatBRL(salaryCfg.baseSalary) : "");
      setChargesMultiplier(salaryCfg.chargesMultiplier);
    }
  }, [targetUser, isOpen]);

  if (!isOpen || !targetUser) return null;

  const isSelf = currentUser?.id === targetUser.id;

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Informe o nome do usuário");
    if (!email.trim()) return toast.error("Informe o e-mail do usuário");

    setBusy(true);
    try {
      // 1. Atualizar nome e e-mail na tabela profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          display_name: name.trim().toUpperCase(),
          email: email.trim().toLowerCase(),
        })
        .eq("id", targetUser!.id);

      if (profileError) throw profileError;

      // 2. Atualizar cargo / direitos na tabela user_roles
      const dbRole = role === "admin" ? "admin" : role === "financeiro" ? "financeiro" : "user";
      
      await supabase.from("user_roles").delete().eq("user_id", targetUser!.id);
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: targetUser!.id,
        role: dbRole,
      });

      if (roleError) throw roleError;

      // 3. Sincronizar com Supabase Auth via RPC (se a função estiver disponível no banco)
      try {
        await supabase.rpc("admin_update_user_credentials", {
          target_user_id: targetUser!.id,
          new_name: name.trim().toUpperCase(),
          new_email: email.trim().toLowerCase(),
          new_password: password.trim() ? password.trim() : null,
        });
      } catch (rpcCatch) {
        console.warn("Aviso ao sincronizar Supabase Auth:", rpcCatch);
      }

      // 4. Se for a própria conta logada e alterou senha, atualiza também a sessão local
      if (password.trim() && isSelf) {
        try {
          await supabase.auth.updateUser({
            password: password.trim(),
          });
        } catch (authErr) {
          console.warn("Aviso ao atualizar sessão local:", authErr);
        }
      }

      // 5. Salvar configurações de remuneração e multiplicador de encargos
      await saveUserSalaryConfig(targetUser!.id, baseSalary, chargesMultiplier);

      toast.success(`Usuário ${name.trim().toUpperCase()} atualizado com sucesso!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Erro ao atualizar dados do usuário:", err);
      toast.error(err.message || "Erro ao atualizar dados do usuário");
    } finally {
      setBusy(false);
    }
  }

  function handleCopyCredentials() {
    const text = `Acesso MykaFlow:\nNome: ${name.trim().toUpperCase()}\nE-mail: ${email.trim().toLowerCase()}${password ? `\nSenha: ${password}` : ""}`;
    navigator.clipboard.writeText(text);
    toast.success("Dados de acesso copiados para a área de transferência!");
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      <div className="glass relative w-full max-w-3xl max-h-[96vh] my-auto rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto custom-scrollbar">
        <button
          onClick={onClose}
          className="btn-ghost-neon absolute right-5 top-5 p-2 rounded-xl text-muted-foreground hover:text-white cursor-pointer z-10"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Cabeçalho */}
        <div className="mb-5 sm:mb-6 text-center">
          <div className="mx-auto mb-2.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.3)]">
            <UserCircle className="h-7 w-7" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-wider text-white uppercase">
            Edição de Usuário
          </h2>
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-muted-foreground font-bold mt-0.5">
            Identificação, Acesso, Direitos e Remuneração
          </p>
        </div>

        <form onSubmit={handleUpdate} className="space-y-4 sm:space-y-4.5">
          {/* Linha 1: Nome e E-mail lado a lado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* Nome de Exibição */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-widest text-cyan-300 font-black ml-1">
                Nome de Exibição *
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do usuário"
                  className="input-futuristic w-full rounded-xl pl-10 pr-3.5 py-2.5 outline-none text-sm font-bold tracking-wide uppercase bg-black/70 border-white/15 text-white"
                />
              </div>
            </div>

            {/* E-mail de Login */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-widest text-cyan-300 font-black ml-1">
                E-mail de Login *
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@email.com"
                  className="input-futuristic w-full rounded-xl pl-10 pr-3.5 py-2.5 outline-none text-sm font-mono tracking-wide bg-black/70 border-white/15 text-white"
                />
              </div>
            </div>
          </div>

          {/* Linha 2: Senha Provisória / Visualização de Acesso */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between ml-1">
              <label className="text-[10px] uppercase tracking-widest text-cyan-300 font-black flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                Senha de Acesso / Provisória
              </label>
              {password && (
                <button
                  type="button"
                  onClick={handleCopyCredentials}
                  className="text-[9px] uppercase font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer transition-colors"
                  title="Copiar dados de acesso"
                >
                  <Copy className="h-3 w-3" />
                  <span>Copiar Acesso</span>
                </button>
              )}
            </div>

            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite ou gere uma nova senha..."
                  className="input-futuristic w-full rounded-xl pl-10 pr-10 py-2.5 outline-none text-sm font-mono tracking-wide bg-black/70 border-white/15 text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white cursor-pointer p-1"
                  title={showPassword ? "Ocultar senha" : "Ver senha"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const generated = genPassword();
                  setPassword(generated);
                  setShowPassword(true);
                }}
                className="btn-ghost-neon px-3 py-2.5 rounded-xl flex items-center gap-1 text-xs cursor-pointer shrink-0"
                title="Gerar nova senha segura"
              >
                <RefreshCw className="h-4 w-4 text-sky-400" />
                <span className="text-[10px] font-bold">Gerar</span>
              </button>
            </div>
          </div>

          {/* Linha 3: Direitos de Acesso ao Sistema */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <label className="text-[10px] uppercase tracking-widest text-cyan-300 font-black ml-1 block">
              Direitos de Acesso ao Sistema *
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Opção 1: ADMINISTRADOR */}
              <button
                type="button"
                onClick={() => setRole("admin")}
                className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 relative ${
                  role === "admin"
                    ? "bg-amber-500/20 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.35)] ring-2 ring-amber-400/80 scale-[1.01] opacity-100"
                    : "bg-black/30 border-white/10 opacity-50 hover:opacity-80 hover:bg-white/[0.03] hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`p-2 rounded-xl transition-colors ${
                      role === "admin"
                        ? "bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.8)]"
                        : "bg-white/5 text-muted-foreground border border-white/10"
                    }`}
                  >
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  {role === "admin" && (
                    <CheckCircle2 className="h-4 w-4 text-amber-400 shrink-0" />
                  )}
                </div>
                <div>
                  <span
                    className={`font-black text-xs uppercase block ${
                      role === "admin" ? "text-amber-300" : "text-muted-foreground"
                    }`}
                  >
                    ADMINISTRADOR
                  </span>
                  <span
                    className={`text-[9px] leading-tight block mt-0.5 ${
                      role === "admin" ? "text-slate-200" : "text-muted-foreground/60"
                    }`}
                  >
                    Acesso irrestrito a todos os módulos
                  </span>
                </div>
              </button>

              {/* Opção 2: FINANCEIRO */}
              <button
                type="button"
                onClick={() => setRole("financeiro")}
                className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 relative ${
                  role === "financeiro"
                    ? "bg-emerald-500/20 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.35)] ring-2 ring-emerald-400/80 scale-[1.01] opacity-100"
                    : "bg-black/30 border-white/10 opacity-50 hover:opacity-80 hover:bg-white/[0.03] hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`p-2 rounded-xl transition-colors ${
                      role === "financeiro"
                        ? "bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.8)]"
                        : "bg-white/5 text-muted-foreground border border-white/10"
                    }`}
                  >
                    <Wallet className="h-4 w-4" />
                  </div>
                  {role === "financeiro" && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  )}
                </div>
                <div>
                  <span
                    className={`font-black text-xs uppercase block ${
                      role === "financeiro" ? "text-emerald-300" : "text-muted-foreground"
                    }`}
                  >
                    FINANCEIRO
                  </span>
                  <span
                    className={`text-[9px] leading-tight block mt-0.5 ${
                      role === "financeiro" ? "text-slate-200" : "text-muted-foreground/60"
                    }`}
                  >
                    Acesso ao Financeiro e Comercial
                  </span>
                </div>
              </button>

              {/* Opção 3: COMERCIAL */}
              <button
                type="button"
                onClick={() => setRole("crm")}
                className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 relative ${
                  role === "crm"
                    ? "bg-sky-500/20 border-sky-500 shadow-[0_0_20px_rgba(56,189,248,0.35)] ring-2 ring-sky-400/80 scale-[1.01] opacity-100"
                    : "bg-black/30 border-white/10 opacity-50 hover:opacity-80 hover:bg-white/[0.03] hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`p-2 rounded-xl transition-colors ${
                      role === "crm"
                        ? "bg-sky-500 text-black shadow-[0_0_10px_rgba(56,189,248,0.8)]"
                        : "bg-white/5 text-muted-foreground border border-white/10"
                    }`}
                  >
                    <Users2 className="h-4 w-4" />
                  </div>
                  {role === "crm" && (
                    <CheckCircle2 className="h-4 w-4 text-sky-400 shrink-0" />
                  )}
                </div>
                <div>
                  <span
                    className={`font-black text-xs uppercase block ${
                      role === "crm" ? "text-sky-300" : "text-muted-foreground"
                    }`}
                  >
                    COMERCIAL
                  </span>
                  <span
                    className={`text-[9px] leading-tight block mt-0.5 ${
                      role === "crm" ? "text-slate-200" : "text-muted-foreground/60"
                    }`}
                  >
                    Acesso exclusivo ao Módulo Comercial
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Linha 4: Remuneração & Encargos (Última seção do modal) */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between ml-1">
              <label className="text-[10px] uppercase tracking-widest text-amber-300 font-black flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-amber-400" />
                Remuneração & Encargos (Custo de Atividades)
              </label>
              <span className="text-[9px] font-mono text-muted-foreground uppercase font-bold">
                Base: 160h/mês
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Salário Base com Formatação de Milhar */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-300 font-bold ml-1">
                  Salário Base (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-400">R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={salaryDisplay}
                    onChange={(e) => {
                      const numeric = parseBRL(e.target.value);
                      setBaseSalary(numeric);
                      setSalaryDisplay(numeric > 0 ? formatBRL(numeric) : "");
                    }}
                    placeholder="0,00"
                    className="input-futuristic w-full rounded-xl pl-10 pr-3.5 py-2.5 outline-none text-sm font-mono font-bold bg-black/70 border-amber-500/30 text-amber-200 focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Multiplicador de Encargos */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-300 font-bold ml-1">
                  Multiplicador de Encargos
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1.0"
                    step="0.05"
                    value={chargesMultiplier || ""}
                    onChange={(e) => setChargesMultiplier(Math.max(1.0, Number(e.target.value) || 1.0))}
                    placeholder="1.0"
                    className="input-futuristic w-full rounded-xl px-3.5 py-2.5 outline-none text-sm font-mono font-bold bg-black/70 border-amber-500/30 text-amber-200 focus:border-amber-400"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-400">x</span>
                </div>
              </div>
            </div>
          </div>

          {/* Botão de Salvar Alterações */}
          <button
            disabled={busy}
            type="submit"
            className="w-full rounded-2xl py-3.5 text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 mt-4 cursor-pointer text-cyan-400 border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/25 transition-all shadow-sm"
          >
            {busy ? <Save className="h-4 w-4 animate-spin text-cyan-400" /> : <Save className="h-4 w-4 text-cyan-400" />}
            <span className="text-cyan-400">{busy ? "Salvando Alterações..." : "Salvar Alterações"}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
