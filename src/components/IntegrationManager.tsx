import { useState, useEffect } from "react";
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
  ShieldAlert,
  Trash2
} from "lucide-react";

const FACTORING_CONFIG = {
  url: "https://wzxrhkjyxpphrclravfz.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo"
};

const factoringSupabase = createClient(FACTORING_CONFIG.url, FACTORING_CONFIG.key);

export function IntegrationManager() {
  const [status, setStatus] = useState<"idle" | "loading" | "connected" | "error">("idle");
  const [externalData, setExternalData] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteImported() {
    if (!confirm("Tem certeza que deseja apagar TODAS as operações importadas? Isso não pode ser desfeito.")) return;
    
    setDeleting(true);
    try {
      const { data: auth } = await localSupabase.auth.getUser();
      const uid = auth.user?.id;
      
      if (!uid) {
        toast.error("Faça login para realizar esta ação");
        return;
      }
      
      // Apaga em múltiplas chamadas para evitar problemas com caracteres especiais no filtro OR
      const filters = [
        "SYNC%",       // formato atual: SYNC: NF 123
        "%SYNC NF%",   // formato legado: CLIENTE - SYNC NF: 123
        "LIQUIDO%",    // formato legado
        "JUROS%",      // formato legado
      ];

      let totalDeleted = 0;
      for (const pattern of filters) {
        const { count: deleted, error } = await localSupabase
          .from("transactions")
          .delete({ count: 'exact' })
          .eq("user_id", uid)
          .ilike("description", pattern);
        if (error) throw error;
        totalDeleted += deleted || 0;
      }
        
      toast.success(`${totalDeleted} operações importadas foram apagadas com sucesso!`);
    } catch (err: any) {
      console.error("Erro ao apagar:", err);
      toast.error(`Falha ao apagar: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  async function checkConnection() {
    setStatus("loading");
    try {
      // Testa se consegue ler faturas e clientes
      const [inv, cli] = await Promise.all([
        factoringSupabase.from("invoices").select("id").limit(1),
        factoringSupabase.from("clients").select("id").limit(1)
      ]);
      
      if (inv.error || cli.error) {
        setStatus("error");
      } else {
        setStatus("connected");
      }
    } catch (err) {
      setStatus("error");
    }
  }

  async function fetchOperations() {
    setStatus("loading");
    try {
      // Busca faturas e clientes em paralelo
      const [invRes, cliRes] = await Promise.all([
        factoringSupabase.from("invoices").select("*").order("operation_date", { ascending: false }),
        factoringSupabase.from("clients").select("id, name")
      ]);

      if (invRes.error || cliRes.error) {
        toast.error("Erro ao acessar dados. Verifique o RLS de Invoices e Clients.");
        setStatus("error");
        return;
      }

      const clientsMap = new Map(cliRes.data?.map(c => [c.id, c.name]));
      
      const enrichedData = (invRes.data || []).map(inv => {
        const firstInstallment = inv.installments?.[0] || {};
        const dueDate = firstInstallment.dueDate || "---";
        const grossValue = inv.invoice_value || 0;
        
        // Cálculo básico de valor líquido (exemplo usando a taxa mensal do sistema)
        // Valor Líquido = Bruto - (Bruto * Taxa Mensal * (Dias / 30))
        const rate = inv.factoring_monthly_rate || inv.monthly_rate || 0;
        const start = new Date(inv.operation_date);
        const end = new Date(dueDate);
        const diffDays = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)));
        const discount = grossValue * (rate / 100) * (diffDays / 30);
        const netValue = grossValue - discount;

        return {
          ...inv,
          client_name: clientsMap.get(inv.client_id) || "Cliente Desconhecido",
          gross_value: grossValue,
          net_value: netValue,
          due_date: dueDate,
          diff_days: diffDays
        };
      });

      setExternalData(enrichedData);
      setStatus("connected");
      if (enrichedData.length === 0) {
        toast.info("Nenhuma fatura encontrada.");
      }
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  async function handleSync() {
    if (externalData.length === 0) return;
    
    setSyncing(true);
    let successCount = 0;
    let skippedCount = 0;
    const { data: { user } } = await localSupabase.auth.getUser();
    if (!user) {
      toast.error("Usuário não autenticado.");
      return;
    }



    const { data: catDataInc } = await localSupabase
      .from("financial_categories")
      .select("id")
      .eq("name", "ANTECIPAÇÃO DE NOTAS")
      .limit(1)
      .single();

    const { data: catDataExp } = await localSupabase
      .from("financial_categories")
      .select("id")
      .eq("name", "CUSTO ANTECIPAÇÃO")
      .limit(1)
      .single();

    // Buscar subs atuais da categoria Receita
    const { data: currentSubs } = catDataInc?.id
      ? await localSupabase
          .from("financial_subcategories")
          .select("id, name")
          .eq("category_id", catDataInc.id)
      : { data: null };

    const subsMap = new Map(currentSubs?.map(s => [s.name.toUpperCase(), s.id]) || []);

    for (const item of externalData) {
      const clientName = formatFactoringClientSubcategory(item.client_name);
      const baseDesc = formatFactoringInvoiceDescription(item.invoice_number);

      // REGRA EXPLÍCITA: subcategoria = CLIENTE; descrição = apenas "SYNC: NF <número>".
      // Nunca inverter estes campos e nunca prefixar o cliente na descrição.
      // 1. Garantir Subcategoria (CLIENTE)
      let subId = subsMap.get(clientName);
      if (!subId && catDataInc) {
        const { data: newSub, error: subErr } = await localSupabase
          .from("financial_subcategories")
          .insert({ name: clientName, category_id: catDataInc.id, user_id: user.id })
          .select().single();
        if (newSub) {
          subId = newSub.id;
          subsMap.set(clientName, subId);
        }
      }

      // 2. Verificar se já existe (subcategoria/cliente + data + valor + tipo)
      // Não comparamos a descrição porque importações antigas usavam outro formato
      // (ex: "CLIENTE - SYNC: NF X") e geravam falsos negativos.
      const occurredOn = item.operation_date || new Date().toISOString().split('T')[0];
      const grossAmount = item.gross_value || 0;
      let dupQuery = localSupabase
        .from("transactions")
        .select("id")
        .eq("user_id", user.id)
        .eq("occurred_on", occurredOn)
        .eq("amount", grossAmount)
        .eq("type", "income");
      dupQuery = subId ? dupQuery.eq("subcategory_id_v2", subId) : dupQuery.is("subcategory_id_v2", null);
      const { data: existing, error: existErr } = await dupQuery.limit(1);

      if (existErr) {
        console.error("Erro ao checar duplicidade:", existErr);
        continue;
      }

      if (existing && existing.length > 0) {
        skippedCount++;
        continue;
      }


      const discount = item.gross_value - item.net_value;

      // 3. Inserir Receita
      const { error: err1 } = await localSupabase.from("transactions").insert({
        user_id: user.id,
        type: "income",
        nature: "variable",
        category: "ANTECIPAÇÃO DE NOTAS",
        category_id_v2: catDataInc?.id || null,
        subcategory_id_v2: subId || null,
        description: baseDesc,
        amount: item.gross_value || 0,
        occurred_on: item.operation_date || new Date().toISOString().split('T')[0],
      });

      if (err1) {
        console.error("Erro ao inserir receita:", err1);
        toast.error(`Erro na receita ${item.invoice_number || "S/N"}: ${err1.message}`);
        continue;
      }

      // 4. Inserir Despesa
      const { error: err2 } = await localSupabase.from("transactions").insert({
        user_id: user.id,
        type: "expense",
        nature: "variable",
        category: "CUSTO ANTECIPAÇÃO",
        category_id_v2: catDataExp?.id || null,
        subcategory_id_v2: subId || null,
        description: baseDesc,
        amount: discount || 0,
        occurred_on: item.operation_date || new Date().toISOString().split('T')[0],
      });

      if (err2) {
        console.error("Erro ao inserir despesa:", err2);
        toast.error(`Erro na despesa ${item.invoice_number || "S/N"}: ${err2.message}`);
        // Even if expense fails, we already inserted income. 
      }

      successCount++;
    }

    setSyncing(false);
    if (successCount > 0) {
      toast.success(`${successCount} operações novas sincronizadas! ${skippedCount > 0 ? `(${skippedCount} já existiam e foram ignoradas)` : ''}`);
    } else if (skippedCount > 0) {
      toast.info(`Nenhuma operação nova. ${skippedCount} operações já haviam sido importadas.`);
    } else {
      toast.info("Nenhuma operação encontrada para importar.");
    }
    setExternalData([]);
  }

  useEffect(() => {
    checkConnection();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass rounded-3xl p-6 border-2 border-white/5 flex items-center gap-6">
          <div className={`h-16 w-16 rounded-2xl flex items-center justify-center ${
            status === "connected" ? "bg-accent/20 text-accent shadow-[0_0_30px_rgba(34,211,238,0.2)]" : 
            status === "error" ? "bg-red-500/20 text-red-400" : "bg-white/5 text-muted-foreground"
          }`}>
            <Database className="h-8 w-8" />
          </div>
          <div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Conexão Lovable</p>
            <h3 className="text-xl font-black uppercase tracking-wide mt-1">
              {status === "connected" ? "ATIVA" : status === "error" ? "BLOQUEADA" : "TESTANDO..."}
            </h3>
          </div>
        </div>

        <div className="glass rounded-3xl p-6 border-2 border-white/5 flex items-center gap-6 md:col-span-2">
          <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center text-muted-foreground">
            <ArrowRightLeft className="h-8 w-8" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Origem (MykaCash)</p>
            <h3 className="text-lg font-bold tracking-tight mt-1 truncate opacity-60">
              {FACTORING_CONFIG.url}
            </h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="glass rounded-3xl p-8 border-2 border-red-500/20 bg-red-500/5 space-y-6">
            <div className="flex items-center gap-3 text-red-400">
              <ShieldAlert className="h-6 w-6" />
              <h2 className="font-black uppercase tracking-widest text-sm text-white">Segurança RLS</h2>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground font-bold uppercase">
              Rode este comando no SQL Editor do MykaCash:
            </p>
            <div className="bg-black/40 p-4 rounded-xl border border-white/10 font-mono text-[9px] text-accent lowercase">
              ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;<br/>
              ALTER TABLE clients ENABLE ROW LEVEL SECURITY;<br/>
              CREATE POLICY "leitura_externa" ON invoices FOR SELECT USING (true);<br/>
              CREATE POLICY "leitura_externa" ON clients FOR SELECT USING (true);<br/>
              GRANT SELECT ON TABLE invoices TO anon;<br/>
              GRANT SELECT ON TABLE clients TO anon;
            </div>
          </div>

          <button 
            disabled={status !== "connected"}
            onClick={fetchOperations}
            className="w-full py-6 rounded-2xl bg-white/5 border-2 border-white/10 hover:border-accent/40 hover:bg-accent/5 transition-all text-sm font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 disabled:opacity-30"
          >
            BUSCAR OPERAÇÕES <ChevronRight className="h-5 w-5" />
          </button>

          <button
            disabled={deleting}
            onClick={handleDeleteImported}
            className="w-full py-4 mt-4 rounded-2xl bg-red-500/10 border-2 border-red-500/20 hover:border-red-500/40 hover:bg-red-500/20 transition-all text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 text-red-500 disabled:opacity-30"
          >
            {deleting ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> APAGANDO...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" /> APAGAR IMPORTADOS
              </>
            )}
          </button>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="glass rounded-3xl border-2 border-white/5 overflow-hidden min-h-[400px] flex flex-col">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-3 text-muted-foreground">
                <AlertCircle className="h-5 w-5" /> Faturas Identificadas
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
                      <th className="px-4 py-3 text-left">Início/Venc.</th>
                      <th className="px-4 py-3 text-left">Cliente / NF</th>
                      <th className="px-4 py-3 text-right">Bruto</th>
                      <th className="px-4 py-3 text-right">Líquido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {externalData.map((tx, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-4 py-4 text-[10px] font-bold text-muted-foreground">
                          <div className="text-white">{new Date(tx.operation_date).toLocaleDateString('pt-BR')}</div>
                          <div className="opacity-50">{new Date(tx.due_date).toLocaleDateString('pt-BR')}</div>
                        </td>
                        <td className="px-4 py-4 text-xs font-black uppercase group-hover:text-accent transition-colors">
                          <div className="truncate max-w-[150px]">{tx.client_name}</div>
                          <div className="text-[9px] text-muted-foreground opacity-50">NF: {tx.invoice_number}</div>
                        </td>
                        <td className="px-4 py-4 text-[10px] font-bold text-right text-muted-foreground line-through opacity-30">
                          {Number(tx.gross_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className="px-4 py-4 text-sm font-black text-right text-accent tracking-tighter shadow-glow-sm">
                          {Number(tx.net_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-30 py-20">
                  <Link2 className="h-16 w-16" />
                  <p className="text-xs font-black uppercase tracking-[0.2em]">Clique em BUSCAR OPERAÇÕES para iniciar</p>
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
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-6 w-6" />
                  )}
                  {syncing ? "SINCRONIZANDO..." : "IMPORTAR PARA O FLUXO DE CAIXA"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
