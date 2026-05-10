import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminCreateUser } from "@/lib/admin.functions";
import { toast } from "sonner";
import { ShieldCheck, Copy, RefreshCw, UserPlus } from "lucide-react";

function genPassword(len = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let p = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) p += chars[arr[i] % chars.length];
  return p;
}

export function AdminPanel() {
  const create = useServerFn(adminCreateUser);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState(genPassword());
  const [busy, setBusy] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ email: string; password: string } | null>(null);

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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao criar usuário";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <h3 className="text-lg font-bold tracking-widest text-gradient flex items-center gap-2">
        <ShieldCheck className="h-5 w-5" /> Painel ADM
      </h3>
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Crie acessos para sua equipe — a senha é gerada automaticamente.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <input
          required
          placeholder="Nome do funcionário"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
        />
        <input
          required
          type="email"
          placeholder="email@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-futuristic w-full rounded-lg px-3 py-2.5 outline-none"
        />
        <div className="flex gap-2">
          <input
            placeholder="Senha personalizada ou gerada"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-futuristic flex-1 rounded-lg px-3 py-2.5 font-mono text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => setPassword(genPassword())}
            className="btn-ghost-neon rounded-lg px-3"
            title="Gerar nova senha"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(password);
              toast.success("Senha copiada");
            }}
            className="btn-ghost-neon rounded-lg px-3"
            title="Copiar senha"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
        <button
          disabled={busy}
          type="submit"
          className="btn-futuristic w-full rounded-lg px-6 py-3 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <UserPlus className="h-4 w-4" />
          {busy ? "Criando..." : "Criar acesso"}
        </button>
      </form>

      {lastCreated && (
        <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
          <p className="text-xs uppercase tracking-widest text-accent mb-1">Último criado</p>
          <p className="font-mono">{lastCreated.email}</p>
          <p className="font-mono text-xs text-muted-foreground">Senha: {lastCreated.password}</p>
          <button
            onClick={() =>
              navigator.clipboard
                .writeText(`${lastCreated.email} / ${lastCreated.password}`)
                .then(() => toast.success("Credenciais copiadas"))
            }
            className="mt-2 text-xs uppercase tracking-widest text-accent hover:underline"
          >
            Copiar credenciais
          </button>
        </div>
      )}
    </div>
  );
}
