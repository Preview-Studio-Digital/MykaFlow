import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User, X, Save, Mail, UserCircle } from "lucide-react";

interface ProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
}

export function ProfileDialog({ isOpen, onClose, currentUser }: ProfileDialogProps) {
  const [name, setName] = useState(currentUser?.user_metadata?.display_name || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // 1. Atualiza metadados de autenticação
      const { error: authError } = await supabase.auth.updateUser({
        email: email,
        data: { display_name: name }
      });
      if (authError) throw authError;

      // 2. Atualiza a tabela de perfis para que o nome apareça na listagem de lançamentos
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ display_name: name })
        .eq("id", currentUser.id);
      
      if (profileError) throw profileError;
      
      toast.success("Perfil atualizado! Se você alterou o e-mail, verifique sua caixa de entrada para confirmar.");
      onClose();
      window.location.reload(); // Recarregar para atualizar os dados globais
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
        <button onClick={onClose} className="absolute right-6 top-6 text-muted-foreground hover:text-white transition-colors">
          <X className="h-5 w-5" />
        </button>

        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 text-accent glow">
            <UserCircle className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-black tracking-widest text-gradient uppercase">Meu Perfil</h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold mt-1">Configure seus dados de acesso</p>
        </div>

        <form onSubmit={handleUpdate} className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-accent font-black ml-1">Nome de Exibição</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                className="input-futuristic w-full rounded-2xl pl-12 pr-4 py-4 outline-none text-sm font-bold tracking-wide"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-accent font-black ml-1">E-mail de Login</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="input-futuristic w-full rounded-2xl pl-12 pr-4 py-4 outline-none text-sm font-mono tracking-wide"
              />
            </div>
          </div>

          <button
            disabled={busy}
            type="submit"
            className="btn-futuristic w-full rounded-2xl py-4 text-xs font-black uppercase tracking-[0.3em] shadow-glow flex items-center justify-center gap-2 mt-4"
          >
            {busy ? <Save className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {busy ? "Salvando..." : "Salvar Alterações"}
          </button>
        </form>
      </div>
    </div>
  );
}
