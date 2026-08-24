import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase as localSupabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatFactoringClientSubcategory, formatFactoringInvoiceDescription } from "@/lib/factoring-import-format";
import { ConfirmModal } from "./ConfirmModal";
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
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo",
  email: "integracao@mykacompressores.com.br",
  password: "Senhadiego2307",
};

const factoringSupabase = createClient(FACTORING_CONFIG.url, FACTORING_CONFIG.key, {
  auth: { storageKey: "myka-factoring-auth", persistSession: true, autoRefreshToken: true },
});

async function ensureFactoringAuth() {
  const { data: { session } } = await factoringSupabase.auth.getSession();
  if (session) return true;
  const { error } = await factoringSupabase.auth.signInWithPassword({
    email: FACTORING_CONFIG.email,
    password: FACTORING_CONFIG.password,
  });
  return !error;
}

type Installment = {
  id: string;
  value: number;
  dueDate: string;
};

type CalcInput = {
  invoiceValue: number;
  operationDate: string;
  monthlyRate: number;
  installments: Installment[];
};

const diffDays = (from: string, to: string): number => {
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
};

const calculateFactoring = (input: CalcInput) => {
  const r = (input.monthlyRate || 0) / 100;
  const totalInvoice = input.installments.reduce((s, i) => s + (i.value || 0), 0) || input.invoiceValue;
  const MIN_EFFECTIVE_PCT = 1.5;

  let sumPV = 0;
  let sumDaysWeighted = 0;
  let sumValues = 0;
  let maxDays = 0;

  const installmentCalcs = input.installments.map((inst) => {
    const days = inst.dueDate ? diffDays(input.operationDate, inst.dueDate) : 0;
    const factor = Math.pow(1 + r, days / 30);
    let pv = (inst.value || 0) / factor;
    
    // Piso de taxa efetiva por parcela
    const naturalCost = (inst.value || 0) - pv;
    const naturalPct = (inst.value || 0) > 0 ? (naturalCost / (inst.value || 0)) * 100 : 0;
    if ((inst.value || 0) > 0 && naturalPct < MIN_EFFECTIVE_PCT) {
      pv = (inst.value || 0) * (1 - MIN_EFFECTIVE_PCT / 100);
    }
    
    sumPV += pv;
    sumDaysWeighted += days * (inst.value || 0);
    sumValues += inst.value || 0;
    if (days > maxDays) maxDays = days;
    
    return {
      id: inst.id,
      value: inst.value || 0,
      dueDate: inst.dueDate,
      days,
      presentValue: pv,
    };
  });

  let netValue = sumPV;
  let operationCost = totalInvoice - netValue;
  let effectiveRatePct = totalInvoice > 0 ? (operationCost / totalInvoice) * 100 : 0;

  if (totalInvoice > 0 && effectiveRatePct < MIN_EFFECTIVE_PCT) {
    operationCost = totalInvoice * (MIN_EFFECTIVE_PCT / 100);
    netValue = totalInvoice - operationCost;
    effectiveRatePct = MIN_EFFECTIVE_PCT;
  }

  return {
    totalInvoice,
    netValue,
    operationCost,
    effectiveRatePct
  };
};

import { MONTHS_PT } from "@/lib/finance-constants";

const generateMonthOptions = () => {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0 a 11

  // Inclui meses a partir do ano anterior até o mês atual
  for (let y = currentYear - 1; y <= currentYear; y++) {
    const maxMonth = y === currentYear ? currentMonth : 11;
    for (let m = 0; m <= maxMonth; m++) {
      const monthNum = String(m + 1).padStart(2, "0");
      const value = `${y}-${monthNum}`;
      const label = `${MONTHS_PT[m]} ${y}`;
      options.push({ value, label });
    }
  }
  return options;
};

const MONTH_OPTIONS = generateMonthOptions();

const getDefaultMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

function getFactoringEffectiveDate(inv: any): string {
  if (inv.is_additional) {
    const settled = Array.isArray(inv.settled_installments) && inv.settled_installments[0];
    const settledDate = settled?.date || (settled?.settled_at ? String(settled.settled_at).split("T")[0] : null);
    const inst = Array.isArray(inv.installments) && inv.installments[0];
    const dueDate = inst?.dueDate;
    return settledDate || dueDate || inv.operation_date;
  }
  return inv.operation_date;
}

export function IntegrationManager() {
  const [status, setStatus] = useState<"idle" | "loading" | "connected" | "error">("idle");
  const [selectedMonth, setSelectedMonth] = useState<string>(getDefaultMonth);
  const [externalData, setExternalData] = useState<any[]>([]);
  const [syncedData, setSyncedData] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  async function executeDeleteImported() {
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
      await fetchOperations();
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
      const authed = await ensureFactoringAuth();
      if (!authed) { setStatus("error"); return; }
      const [inv, cli] = await Promise.all([
        factoringSupabase.from("invoices").select("id").limit(1),
        factoringSupabase.from("clients").select("id").limit(1)
      ]);
      if (inv.error || cli.error) setStatus("error");
      else setStatus("connected");
    } catch (err) {
      setStatus("error");
    }
  }

  async function fetchOperations() {
    setStatus("loading");
    try {
      const authed = await ensureFactoringAuth();
      if (!authed) {
        toast.error("Falha ao autenticar no MykaCash.");
        setStatus("error");
        return;
      }
      const [invRes, cliRes] = await Promise.all([
        factoringSupabase.from("invoices").select("*").order("operation_date", { ascending: false }),
        factoringSupabase.from("clients").select("id, name")
      ]);

      if (invRes.error || cliRes.error) {
        toast.error("Erro ao acessar dados. Verifique o RLS de Invoices e Clients.");
        setStatus("error");
        return;
      }

      // Buscar transações locais para evitar duplicados e carregar o histórico sincronizado do mês
      const { data: auth } = await localSupabase.auth.getUser();
      const uid = auth.user?.id;
      const existingOpKeys = new Set<string>();
      const syncedMap = new Map<string, any>();

      if (uid) {
        const [yearStr, monthStr] = selectedMonth.split("-");
        const lastDay = new Date(Number(yearStr), Number(monthStr), 0).getDate();
        const endDate = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;

        const { data: existingTx } = await localSupabase
          .from("transactions")
          .select("*, financial_subcategories:subcategory_id_v2(name)")
          .eq("user_id", uid)
          .gte("occurred_on", `${selectedMonth}-01`)
          .lte("occurred_on", endDate)
          .like("description", "%SYNC%");
        
        existingTx?.forEach(t => {
          const desc = t.description || "";
          const isAdd = desc.toUpperCase().includes("ADICIONAL");
          const match = desc.match(/NF\s*:?\s*(\w+)/i);
          if (match) {
            const nf = match[match.length - 1].trim().toUpperCase();
            const opKey = `${nf}_${t.occurred_on}_${isAdd ? 'ADD' : 'MAIN'}`;
            existingOpKeys.add(opKey);

            const existing = syncedMap.get(opKey) || {
              invoice_number: nf,
              is_additional: isAdd,
              client_name: t.financial_subcategories?.name || "Cliente Desconhecido",
              gross_value: 0,
              discount: 0,
              operation_date: t.occurred_on
            };

            if (t.type === "income") {
              existing.gross_value = t.amount;
            } else {
              existing.discount = t.amount;
            }

            syncedMap.set(opKey, existing);
          }
        });
      }

      const clientsMap = new Map(cliRes.data?.map(c => [c.id, c.name]));
      
      const enrichedData = (invRes.data || [])
        .filter(inv => {
          // 1. Filtrar pelo mês da competência do caixa (para operações adicionais, usa data de liquidação/vencimento)
          const effectiveDate = getFactoringEffectiveDate(inv);
          if (!effectiveDate || !effectiveDate.startsWith(selectedMonth)) {
            return false;
          }
          // 2. Filtrar notas já importadas (considerando operação principal vs adicional e data efetiva de saída)
          const nf = String(inv.invoice_number || "").trim().toUpperCase();
          const opKey = `${nf}_${effectiveDate}_${inv.is_additional ? 'ADD' : 'MAIN'}`;
          return !existingOpKeys.has(opKey);
        })
        .map(inv => {
          const installments = Array.isArray(inv.installments) ? inv.installments : [];
          const effectiveDate = getFactoringEffectiveDate(inv);
          
          // Calcular desconto e valor líquido usando juros compostos oficial do MykaCash
          const calc = calculateFactoring({
            invoiceValue: Number(inv.invoice_value) || 0,
            operationDate: inv.operation_date,
            monthlyRate: Number(inv.monthly_rate) || 0,
            installments: installments as Installment[]
          });

          const grossValue = calc.totalInvoice;
          const netValue = calc.netValue;
          const discount = calc.operationCost;

          const firstInstallment = installments[0] || {};
          const dueDate = firstInstallment.dueDate || "---";

          return {
            ...inv,
            effective_date: effectiveDate,
            client_name: clientsMap.get(inv.client_id) || "Cliente Desconhecido",
            gross_value: grossValue,
            net_value: netValue,
            discount: discount,
            due_date: dueDate
          };
        });

      setExternalData(enrichedData);
      setSyncedData(Array.from(syncedMap.values()));
      setStatus("connected");
      if (enrichedData.length === 0) {
        toast.info(`Nenhuma nova fatura pendente de importação para o mês ${selectedMonth.split('-')[1]}/${selectedMonth.split('-')[0]}.`);
      } else {
        toast.success(`${enrichedData.length} nova(s) fatura(s) carregada(s) para importação.`);
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
      setSyncing(false);
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

    // Buscar transações locais de última hora para evitar duplicados caso o botão seja clicado rapidamente
    const { data: existingTx } = await localSupabase
      .from("transactions")
      .select("description, occurred_on")
      .eq("user_id", user.id)
      .like("description", "%SYNC%");
    
    const existingOpKeys = new Set<string>();
    existingTx?.forEach(t => {
      const desc = t.description || "";
      const isAdd = desc.toUpperCase().includes("ADICIONAL");
      const match = desc.match(/NF\s*:?\s*(\w+)/i);
      if (match) {
        const nf = match[match.length - 1].trim().toUpperCase();
        existingOpKeys.add(`${nf}_${t.occurred_on}_${isAdd ? 'ADD' : 'MAIN'}`);
      }
    });

    // Calcular custos individuais arredondados e aplicar ajuste
    let totalUnroundedCost = 0;
    const itemsWithAdjustedCost = externalData.map((item) => {
      totalUnroundedCost += item.discount || 0;
      return {
        ...item,
        adjustedCost: Math.round((item.discount || 0) * 100) / 100,
        adjustedGross: Math.round((item.gross_value || 0) * 100) / 100
      };
    });

    const expectedMonthlyCost = Math.round(totalUnroundedCost * 100) / 100;
    const sumOfRoundedCosts = itemsWithAdjustedCost.reduce((sum, item) => sum + item.adjustedCost, 0);
    const roundingDiff = Math.round((expectedMonthlyCost - sumOfRoundedCosts) * 100) / 100;

    if (roundingDiff !== 0 && itemsWithAdjustedCost.length > 0) {
      const lastIndex = itemsWithAdjustedCost.length - 1;
      itemsWithAdjustedCost[lastIndex].adjustedCost = Math.round((itemsWithAdjustedCost[lastIndex].adjustedCost + roundingDiff) * 100) / 100;
    }

    for (const item of itemsWithAdjustedCost) {
      const clientName = formatFactoringClientSubcategory(item.client_name);
      const baseDesc = formatFactoringInvoiceDescription(item.invoice_number, item.is_additional);
      const nf = String(item.invoice_number || "").trim().toUpperCase();
      const occurredOn = getFactoringEffectiveDate(item) || item.operation_date || new Date().toISOString().split('T')[0];
      const opKey = `${nf}_${occurredOn}_${item.is_additional ? 'ADD' : 'MAIN'}`;

      if (existingOpKeys.has(opKey)) {
        skippedCount++;
        continue;
      }

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

      // 3. Inserir Receita APENAS para operações principais (operações adicionais/prorrogações não movimentam novo capital)
      if (!item.is_additional) {
        const { error: err1 } = await localSupabase.from("transactions").insert({
          user_id: user.id,
          type: "income",
          nature: "variable",
          category: "ANTECIPAÇÃO DE NOTAS",
          category_id_v2: catDataInc?.id || null,
          subcategory_id_v2: subId || null,
          description: baseDesc,
          amount: item.adjustedGross || 0,
          occurred_on: occurredOn,
        });

        if (err1) {
          console.error("Erro ao inserir receita:", err1);
          toast.error(`Erro na receita ${item.invoice_number || "S/N"}: ${err1.message}`);
          continue;
        }
      }

      // 4. Inserir Despesa (Custo da Operação / Juros Adicionais da Prorrogação)
      const { error: err2 } = await localSupabase.from("transactions").insert({
        user_id: user.id,
        type: "expense",
        nature: "variable",
        category: "CUSTO ANTECIPAÇÃO",
        category_id_v2: catDataExp?.id || null,
        subcategory_id_v2: subId || null,
        description: baseDesc,
        amount: item.adjustedCost || 0,
        occurred_on: occurredOn,
      });

      if (err2) {
        console.error("Erro ao inserir despesa:", err2);
        toast.error(`Erro na despesa ${item.invoice_number || "S/N"}: ${err2.message}`);
      }

      successCount++;
      existingOpKeys.add(opKey);
    }

    setSyncing(false);
    if (successCount > 0) {
      toast.success(`${successCount} faturas sincronizadas com sucesso! ${skippedCount > 0 ? `(${skippedCount} já existiam e foram ignoradas)` : ''}`);
    } else if (skippedCount > 0) {
      toast.info(`Nenhuma operação nova. ${skippedCount} já haviam sido importadas.`);
    } else {
      toast.info("Nenhuma fatura encontrada para importar.");
    }
    await fetchOperations();
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
          <div className="glass rounded-3xl p-6 border-2 border-white/5 space-y-3">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">
              Mês de Referência
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full py-4 px-4 rounded-2xl bg-black/40 border-2 border-white/10 text-white font-bold text-sm focus:outline-none focus:border-accent/40 transition-all cursor-pointer"
            >
              {MONTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-neutral-900 text-white">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button 
            disabled={status !== "connected"}
            onClick={fetchOperations}
            className="w-full py-6 rounded-2xl bg-white/5 border-2 border-white/10 hover:border-accent/40 hover:bg-accent/5 transition-all text-sm font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 disabled:opacity-30 cursor-pointer"
          >
            BUSCAR OPERAÇÕES <ChevronRight className="h-5 w-5" />
          </button>

          <button
            disabled={deleting}
            onClick={() => setIsConfirmDeleteOpen(true)}
            className="w-full py-4 mt-4 rounded-2xl bg-red-500/10 border-2 border-red-500/20 hover:border-red-500/40 hover:bg-red-500/20 transition-all text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 text-red-500 disabled:opacity-30 cursor-pointer"
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
                          {tx.is_additional ? (
                            <div>
                              <div className="text-amber-400 font-bold">
                                {new Date(tx.effective_date + "T00:00:00").toLocaleDateString('pt-BR')}
                              </div>
                              <div className="opacity-40 text-[9px]">
                                Abertura: {new Date(tx.operation_date + "T00:00:00").toLocaleDateString('pt-BR')}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-white">
                                {new Date(tx.operation_date + "T00:00:00").toLocaleDateString('pt-BR')}
                              </div>
                              <div className="opacity-50">
                                {new Date(tx.due_date + "T00:00:00").toLocaleDateString('pt-BR')}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-xs font-black uppercase group-hover:text-accent transition-colors">
                          <div className="flex items-center gap-2">
                            <div className="truncate max-w-[150px]">{tx.client_name}</div>
                            {tx.is_additional && (
                              <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-black border border-amber-500/30">
                                ADICIONAL
                              </span>
                            )}
                          </div>
                          <div className="text-[9px] text-muted-foreground opacity-50">NF: {tx.invoice_number}</div>
                        </td>
                        <td className="px-4 py-4 text-[10px] font-bold text-right text-muted-foreground">
                          {tx.is_additional ? (
                            <span className="opacity-40 font-mono">---</span>
                          ) : (
                            <span className="line-through opacity-30">
                              {Number(tx.gross_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm font-black text-right tracking-tighter">
                          {tx.is_additional ? (
                            <span className="text-destructive font-mono">
                              - {Number(tx.discount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          ) : (
                            <span className="text-accent shadow-glow-sm">
                              {Number(tx.net_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          )}
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

          {/* Operações Já Sincronizadas */}
          <div className="glass rounded-3xl border-2 border-white/5 overflow-hidden min-h-[300px] flex flex-col">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-3 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" /> Já Sincronizadas (MykaFlow)
              </h2>
              <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/30">
                {syncedData.length} REGISTROS
              </span>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {syncedData.length > 0 ? (
                <table className="w-full">
                  <thead className="text-[10px] font-black text-muted-foreground uppercase border-b border-white/5">
                    <tr>
                      <th className="px-4 py-3 text-left">Data Op.</th>
                      <th className="px-4 py-3 text-left">Cliente / NF</th>
                      <th className="px-4 py-3 text-right">Bruto</th>
                      <th className="px-4 py-3 text-right">Custo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {syncedData.map((tx, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-4 py-4 text-[10px] font-bold text-white">
                          {new Date(tx.operation_date + "T00:00:00").toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-4 text-xs font-black uppercase group-hover:text-emerald-400 transition-colors">
                          <div className="flex items-center gap-2">
                            <div className="truncate max-w-[150px]">{tx.client_name}</div>
                            {tx.is_additional && (
                              <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-black border border-amber-500/30">
                                ADICIONAL
                              </span>
                            )}
                          </div>
                          <div className="text-[9px] text-muted-foreground opacity-50">NF: {tx.invoice_number}</div>
                        </td>
                        <td className="px-4 py-4 text-[10px] font-bold text-right text-emerald-400">
                          {tx.is_additional ? (
                            <span className="opacity-40 font-mono text-muted-foreground">---</span>
                          ) : (
                            Number(tx.gross_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm font-black text-right text-destructive tracking-tighter">
                          - {Number(tx.discount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-30 py-16">
                  <CheckCircle2 className="h-12 w-12" />
                  <p className="text-xs font-black uppercase tracking-[0.2em]">Nenhuma operação sincronizada neste mês</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isConfirmDeleteOpen && (
        <ConfirmModal
          isOpen={isConfirmDeleteOpen}
          onClose={() => setIsConfirmDeleteOpen(false)}
          onConfirm={() => {
            setIsConfirmDeleteOpen(false);
            executeDeleteImported();
          }}
          title="Apagar Operações Importadas"
          description="Tem certeza que deseja apagar TODAS as operações importadas do Factoring? Esta ação não pode ser desfeita."
          confirmText="Apagar Importados"
          variant="danger"
          isLoading={deleting}
        />
      )}
    </div>
  );
}
