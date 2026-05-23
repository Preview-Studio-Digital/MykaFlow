import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabase as localSupabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatFactoringClientSubcategory, formatFactoringInvoiceDescription } from "@/lib/factoring-import-format";
import { 
  Link2, 
  RefreshCw, 
  Database, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRightLeft,
  ChevronRight,
  ShieldAlert
} from "lucide-react";

export const Route = createFileRoute("/integration")({
  component: IntegrationPage,
});

const FACTORING_CONFIG = {
  url: "https://wzxrhkjyxpphrclravfz.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo"
};

const factoringSupabase = createClient(FACTORING_CONFIG.url, FACTORING_CONFIG.key);

function IntegrationPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "connected" | "error">("idle");
  const [externalData, setExternalData] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);

  async function checkConnection() {
    setStatus("loading");
    try {
      // Tenta ler algo básico para testar a conexão e RLS
      const { error } = await factoringSupabase.from("invoices").select("*", { count: "exact", head: true });
      
      if (error) {
        console.error("Erro na conexão externa:", error);
        setStatus("error");
        toast.error("Conectado, mas o acesso aos dados está bloqueado (RLS)");
      } else {
        setStatus("connected");
        toast.success("Conexão estabelecida com sucesso!");
      }
    } catch (err) {
      setStatus("error");
      toast.error("Falha ao conectar com o outro sistema");
    }
  }

  async function fetchOperations() {
    setStatus("loading");
    const [invRes, cliRes] = await Promise.all([
      factoringSupabase.from("invoices").select("*").order("created_at", { ascending: false }),
      factoringSupabase.from("clients").select("id, name"),
    ]);

    if (invRes.error || cliRes.error) {
      toast.error("Não foi possível ler as operações. Verifique as permissões de RLS.");
      setStatus("error");
    } else {
      const clientsMap = new Map(cliRes.data?.map((c) => [c.id, c.name]) || []);
      setExternalData((invRes.data || []).map((inv) => ({
        ...inv,
        client_name: clientsMap.get(inv.client_id) || "Cliente Desconhecido",
      })));
      setStatus("connected");
      if (invRes.data?.length === 0) {
        toast.info("Nenhuma operação encontrada (ou acesso restrito)");
      }
    }
  }

  async function handleSync() {
    if (externalData.length === 0) return;
    setSyncing(true);
    
    const { data: auth } = await localSupabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setSyncing(false);
      toast.error("Faça login para sincronizar");
      return;
    }

    let successCount = 0;
    const { data: catDataInc } = await localSupabase
      .from("financial_categories")
      .select("id")
      .eq("name", "ANTECIPAÇÃO DE NOTAS")
      .limit(1)
      .single();

    const { data: currentSubs } = catDataInc?.id
      ? await localSupabase
          .from("financial_subcategories")
          .select("id, name")
          .eq("category_id", catDataInc.id)
      : { data: null };
    const subsMap = new Map(currentSubs?.map((s) => [s.name.toUpperCase(), s.id]) || []);
    
    for (const item of externalData) {
      const clientName = formatFactoringClientSubcategory(item.client_name);
      const baseDesc = formatFactoringInvoiceDescription(item.invoice_number);
      const amount = item.invoice_value || item.gross_value || item.amount || 0;
      const occurredOn = item.operation_date || item.date || new Date().toISOString().split('T')[0];

      // REGRA EXPLÍCITA: subcategoria = CLIENTE; descrição = apenas "SYNC: NF <número>".
      // Nunca inverter estes campos e nunca prefixar o cliente na descrição.
      let subId = subsMap.get(clientName);
      if (!subId && catDataInc?.id) {
        const { data: newSub } = await localSupabase
          .from("financial_subcategories")
          .insert({ name: clientName, category_id: catDataInc.id, user_id: uid })
          .select("id")
          .single();
        if (newSub) {
          subId = newSub.id;
          subsMap.set(clientName, subId);
        }
      }

      const { error } = await localSupabase.from("transactions").insert({
        user_id: uid,
        type: "income",
        nature: "variable",
        category: "ANTECIPAÇÃO DE NOTAS",
        category_id_v2: catDataInc?.id || null,
        subcategory_id_v2: subId || null,
        description: baseDesc,
        amount,
        occurred_on: occurredOn,
      });

      if (!error) successCount++;
    }

    setSyncing(false);
    if (successCount > 0) {
      toast.success(`${successCount} operações sincronizadas com sucesso!`);
      setExternalData([]);
    } else {
      toast.error("Falha na sincronização");
    }
  }

  useEffect(() => {
    checkConnection();
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 sm:p-8 font-display">
      <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-gradient uppercase flex items-center gap-4">
              <Link2 className="h-10 w-10 text-accent" /> Integração Factoring
            </h1>
            <p className="text-muted-foreground text-sm uppercase tracking-[0.2em] font-bold">
              Sincronize operações entre seus sistemas Lovable
            </p>
          </div>
          
          <button 
            onClick={checkConnection}
            className="btn-futuristic px-8 py-4 rounded-2xl flex items-center gap-3 group"
          >
            <RefreshCw className={`h-5 w-5 group-hover:rotate-180 transition-transform duration-500 ${status === "loading" ? "animate-spin" : ""}`} />
            ATUALIZAR STATUS
          </button>
        </div>

        {/* Status Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass rounded-3xl p-6 border-2 border-white/5 flex items-center gap-6">
            <div className={`h-16 w-16 rounded-2xl flex items-center justify-center ${
              status === "connected" ? "bg-accent/20 text-accent shadow-[0_0_30px_rgba(34,211,238,0.2)]" : 
              status === "error" ? "bg-red-500/20 text-red-400" : "bg-white/5 text-muted-foreground"
            }`}>
              <Database className="h-8 w-8" />
            </div>
            <div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Status da Conexão</p>
              <h3 className="text-xl font-black uppercase tracking-wide mt-1">
                {status === "connected" ? "CONECTADO" : status === "loading" ? "VERIFICANDO..." : status === "error" ? "ACESSO RESTRITO" : "AGUARDANDO"}
              </h3>
            </div>
          </div>

          <div className="glass rounded-3xl p-6 border-2 border-white/5 flex items-center gap-6 md:col-span-2">
            <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center text-muted-foreground">
              <ArrowRightLeft className="h-8 w-8" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Origem dos Dados</p>
              <h3 className="text-lg font-bold tracking-tight mt-1 truncate">
                {FACTORING_CONFIG.url}
              </h3>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Instructions Column */}
          <div className="lg:col-span-1 space-y-6">
            <div className="glass rounded-3xl p-8 border-2 border-red-500/20 bg-red-500/5 space-y-6">
              <div className="flex items-center gap-3 text-red-400">
                <ShieldAlert className="h-6 w-6" />
                <h2 className="font-black uppercase tracking-widest text-sm">Atenção Necessária</h2>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground font-bold uppercase">
                Para que os dados apareçam abaixo, você precisa habilitar a leitura pública no outro sistema Lovable.
              </p>
              <div className="space-y-4 pt-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                <div className="flex gap-3">
                  <span className="text-accent">01.</span>
                  <span>Vá no outro projeto {">"} SQL Editor</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-accent">02.</span>
                  <span>Cole e rode o comando:</span>
                </div>
                <div className="bg-black/40 p-3 rounded-lg border border-white/10 font-mono text-[9px] text-accent lowercase">
                  ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;<br/>
                  CREATE POLICY "permitir_leitura" ON invoices FOR SELECT USING (true);
                </div>
              </div>
            </div>

            <button 
              disabled={status !== "connected"}
              onClick={fetchOperations}
              className="w-full py-6 rounded-2xl bg-white/5 border-2 border-white/10 hover:border-accent/40 hover:bg-accent/5 transition-all text-sm font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 disabled:opacity-30"
            >
              BUSCAR OPERAÇÕES <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Data Preview Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="glass rounded-3xl border-2 border-white/5 overflow-hidden min-h-[400px] flex flex-col">
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-3 text-muted-foreground">
                  <AlertCircle className="h-5 w-5" /> Operações Identificadas
                </h2>
                <span className="text-[10px] font-black bg-accent/20 text-accent px-3 py-1 rounded-full border border-accent/30">
                  {externalData.length} REGISTROS
                </span>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {externalData.length > 0 ? (
                  <table className="w-full">
                    <thead className="text-[10px] font-black text-muted-foreground uppercase border-b border-white/5">
                      <tr>
                        <th className="px-4 py-3 text-left">Data</th>
                        <th className="px-4 py-3 text-left">Cliente</th>
                        <th className="px-4 py-3 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {externalData.map((tx, i) => (
                        <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-4 py-4 text-xs font-bold text-muted-foreground">
                            {new Date(tx.date || tx.created_at).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-4 text-xs font-black uppercase group-hover:text-accent transition-colors">
                            {tx.client_name || "Sem Nome"}
                          </td>
                          <td className="px-4 py-4 text-sm font-black text-right text-accent tracking-tighter">
                            {Number(tx.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-30 py-20">
                    <Database className="h-16 w-16" />
                    <p className="text-xs font-black uppercase tracking-[0.2em]">Nenhum dado carregado para sincronização</p>
                  </div>
                )}
              </div>

              {externalData.length > 0 && (
                <div className="p-8 border-t border-white/5 bg-accent/5">
                  <button 
                    disabled={syncing}
                    onClick={handleSync}
                    className="w-full btn-futuristic py-6 rounded-2xl text-sm font-black uppercase tracking-[0.4em] flex items-center justify-center gap-4 shadow-glow"
                  >
                    {syncing ? (
                      <>
                        <RefreshCw className="h-5 w-5 animate-spin" /> SINCRONIZANDO...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-6 w-6" /> SINCRONIZAR TUDO AGORA
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
