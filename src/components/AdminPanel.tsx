import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminCreateUser, promoteToAdmin, listUsers } from "@/lib/admin.functions";
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

export function AdminPanel() {
  const { role } = useAuth();
  const create = useServerFn(adminCreateUser);
  const promote = useServerFn(promoteToAdmin);
  const list = useServerFn(listUsers);
  
  const [userList, setUserList] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState(genPassword());
  const [busy, setBusy] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ email: string; password: string } | null>(null);

  async function fetchUsers() {
    if (role !== 'admin') return;
    try {
      const data = await list();
      setUserList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erro ao buscar usuários", err);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, [role]);

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
      await create({ data: { email, password, displayName: name } });
      toast.success("Funcionário criado");
      setLastCreated({ email, password });
      setEmail("");
      setName("");
      setPassword(genPassword());
      fetchUsers();
    } catch (err) {
      toast.error("Erro ao criar usuário");
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
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${role === 'admin' ? 'border-accent text-accent' : 'border-red-500 text-red-500'}`}>
            {role?.toUpperCase() || 'OFFLINE'}
          </span>
        </h3>

        {role !== 'admin' && (
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
              {busy ? 'Processando...' : 'Tornar-me Administrador'}
            </button>
          </div>
        )}

        <form onSubmit={submit} className={`space-y-3 ${role !== 'admin' ? 'opacity-30 pointer-events-none' : ''}`}>
          <input required placeholder="Nome" value={name} onChange={e => setName(e.target.value)} className="input-futuristic w-full rounded-lg px-3 py-2 outline-none" />
          <input required type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} className="input-futuristic w-full rounded-lg px-3 py-2 outline-none" />
          <div className="flex gap-2">
            <input value={password} onChange={e => setPassword(e.target.value)} className="input-futuristic flex-1 rounded-lg px-3 py-2 font-mono text-xs outline-none" />
            <button type="button" onClick={() => setPassword(genPassword())} className="btn-ghost-neon px-2 rounded-lg"><RefreshCw className="h-4 w-4" /></button>
          </div>
          <button disabled={busy} type="submit" className="btn-futuristic w-full rounded-lg py-3 text-xs uppercase font-bold">{busy ? 'Criando...' : 'Criar Acesso'}</button>
        </form>

        {lastCreated && (
          <div className="p-3 rounded-lg bg-accent/10 border border-accent/30 text-[10px] font-mono">
            <p className="text-accent uppercase mb-1">Sucesso!</p>
            <p>{lastCreated.email} / {lastCreated.password}</p>
          </div>
        )}
      </div>

      {role === 'admin' && userList.length > 0 && (
        <div className="pt-6 border-t border-white/10 space-y-3">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Users className="h-4 w-4" /> Equipe ({userList.length})
          </h4>
          <div className="space-y-2">
            {userList.map(u => (
              <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                <div className="flex flex-col">
                  <span className="text-xs font-bold">{u.name}</span>
                  <span className="text-[10px] opacity-50">{u.email}</span>
                </div>
                <Mail className="h-3 w-3 opacity-30" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
