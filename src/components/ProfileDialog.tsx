import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User, X, Save, Mail, UserCircle, Lock, Key } from "lucide-react";

interface ProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
}

export function ProfileDialog({ isOpen, onClose, currentUser }: ProfileDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Sincronizar dados quando o diálogo abrir ou o usuário mudar
  useEffect(() => {
    if (currentUser) {
      setName(currentUser.user_metadata?.display_name || "");
      setEmail(currentUser.email || "");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [currentUser, isOpen]);

  if (!isOpen) return null;

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Informe seu nome de exibição");

    if (newPassword && newPassword.length < 6) {
      return toast.error("A nova senha deve ter no mínimo 6 caracteres");
    }

    if (newPassword && newPassword !== confirmPassword) {
      return toast.error("As senhas não coincidem");
    }

    setBusy(true);
    try {
      const updateData: any = {
        data: { display_name: name.trim() },
      };

      // Se o usuário alterou o e-mail
      if (email.trim() && email.trim() !== currentUser?.email) {
        updateData.email = email.trim();
      }

      // Se o usuário digitou uma nova senha
      if (newPassword) {
        updateData.password = newPassword;
      }

      // 1. Atualizar Auth no Supabase
      const { error: authError } = await supabase.auth.updateUser(updateData);
      if (authError) throw authError;

      // 2. Atualizar ou Inserir na tabela de profiles (upsert)
      if (currentUser?.id) {
        const { error: profileError } = await supabase
          .from("profiles")
          .upsert(
            {
              id: currentUser.id,
              display_name: name.trim(),
              email: email.trim() || currentUser.email,
            },
            { onConflict: "id" }
          );

        if (profileError) {
          console.warn("Aviso ao sincronizar profiles:", profileError.message);
        }
      }

      toast.success("Dados de perfil atualizados com sucesso!");
      onClose();

      // Atualizar a página suavemente para refletir o novo nome
      setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar perfil");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      <div className="glass relative w-full max-w-md rounded-3xl p-8 shadow-2xl border border-white/10 animate-in fade-in zoom-in duration-300">
        <button
          onClick={onClose}
          className="btn-ghost-neon absolute right-6 top-6 p-2 rounded-xl text-muted-foreground hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 text-accent glow">
            <UserCircle className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-black tracking-widest text-gradient uppercase">
            Meu Perfil
          </h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold mt-1">
            Altere seu nome, e-mail ou redefina sua senha
          </p>
        </div>

        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest text-accent font-black ml-1">
              Nome de Exibição *
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                className="input-futuristic w-full rounded-xl pl-12 pr-4 py-3 outline-none text-sm font-bold tracking-wide"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest text-accent font-black ml-1">
              E-mail de Login *
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="input-futuristic w-full rounded-xl pl-12 pr-4 py-3 outline-none text-sm font-mono tracking-wide"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-white/5 space-y-3">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold block">
              Alterar Senha (Opcional)
            </span>

            <div className="relative">
              <Key className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nova senha (mínimo 6 caracteres)"
                className="input-futuristic w-full rounded-xl pl-12 pr-4 py-3 outline-none text-xs tracking-wide"
              />
            </div>

            {newPassword && (
              <div className="relative animate-in fade-in">
                <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirme a nova senha"
                  className="input-futuristic w-full rounded-xl pl-12 pr-4 py-3 outline-none text-xs tracking-wide"
                />
              </div>
            )}
          </div>

          <button
            disabled={busy}
            type="submit"
            className="btn-futuristic w-full rounded-2xl py-3.5 text-xs font-black uppercase tracking-[0.2em] shadow-glow flex items-center justify-center gap-2 mt-4"
          >
            {busy ? <Save className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {busy ? "Salvando..." : "Salvar Alterações"}
          </button>
        </form>
      </div>
    </div>
  );
}
