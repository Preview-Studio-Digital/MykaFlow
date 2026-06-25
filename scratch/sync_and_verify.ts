import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  content.split(/\r?\n/).forEach(line => {
    if (!line || line.startsWith("#")) return;
    const parts = line.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      let val = parts.slice(1).join("=").trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
}

loadEnv();

const LOCAL_CONFIG = {
  url: process.env.SUPABASE_URL || "",
  key: process.env.SUPABASE_ANON_KEY || "",
  email: "diegooaraujoo2307@gmail.com",
  password: "Senhadiego2307"
};

const FACTORING_CONFIG = {
  url: "https://wzxrhkjyxpphrclravfz.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo",
  email: "integracao@mykacompressores.com.br",
  password: "Senhadiego2307"
};

const localSupabase = createClient(LOCAL_CONFIG.url, LOCAL_CONFIG.key);
const factoringSupabase = createClient(FACTORING_CONFIG.url, FACTORING_CONFIG.key);

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

async function run() {
  console.log("=== INICIANDO INTEGRAÇÃO E VERIFICAÇÃO ===");

  // 1. Logins
  console.log("Autenticando no Supabase Local...");
  const localAuth = await localSupabase.auth.signInWithPassword({ email: LOCAL_CONFIG.email, password: LOCAL_CONFIG.password });
  if (localAuth.error) throw new Error("Erro login local: " + localAuth.error.message);
  const uid = localAuth.data.user.id;

  console.log("Autenticando no Supabase Externo...");
  const extAuth = await factoringSupabase.auth.signInWithPassword({ email: FACTORING_CONFIG.email, password: FACTORING_CONFIG.password });
  if (extAuth.error) throw new Error("Erro login externo: " + extAuth.error.message);

  // 2. Limpar transações sincronizadas de Março 2026 no local
  console.log("Apagando transações sincronizadas de Março 2026...");
  const deleteFilters = ["SYNC%", "%SYNC NF%"];
  let totalDeleted = 0;
  for (const pattern of deleteFilters) {
    const { count, error } = await localSupabase
      .from("transactions")
      .delete({ count: "exact" })
      .eq("user_id", uid)
      .gte("occurred_on", "2026-03-01")
      .lte("occurred_on", "2026-03-31")
      .ilike("description", pattern);
    if (error) throw error;
    totalDeleted += count || 0;
  }
  console.log(`Deletadas ${totalDeleted} transações anteriores.`);

  // 3. Buscar faturas e clientes do externo
  console.log("Buscando dados externos...");
  const [invRes, cliRes] = await Promise.all([
    factoringSupabase.from("invoices").select("*"),
    factoringSupabase.from("clients").select("id, name")
  ]);

  if (invRes.error) throw invRes.error;
  if (cliRes.error) throw cliRes.error;

  const clientsMap = new Map(cliRes.data?.map(c => [c.id, c.name]));
  const marchInvoices = (invRes.data || [])
    .filter(inv => inv.operation_date && inv.operation_date.startsWith("2026-03"));

  console.log(`Total de faturas externas de Março 2026: ${marchInvoices.length}`);

  // 4. Buscar categorias financeiras locais
  const { data: catDataInc } = await localSupabase
    .from("financial_categories")
    .select("id")
    .eq("name", "ANTECIPAÇÃO DE NOTAS")
    .single();

  const { data: catDataExp } = await localSupabase
    .from("financial_categories")
    .select("id")
    .eq("name", "CUSTO ANTECIPAÇÃO")
    .single();

  if (!catDataInc || !catDataExp) {
    throw new Error("Categorias financeiras ANTECIPAÇÃO DE NOTAS ou CUSTO ANTECIPAÇÃO não encontradas!");
  }

  const { data: currentSubs } = await localSupabase
    .from("financial_subcategories")
    .select("id, name")
    .eq("category_id", catDataInc.id);

  const subsMap = new Map(currentSubs?.map(s => [s.name.toUpperCase(), s.id]) || []);

  // 5. Inserir e calcular faturas
  let successCount = 0;
  for (const item of marchInvoices) {
    const rawClientName = clientsMap.get(item.client_id) || "Cliente Desconhecido";
    const clientName = rawClientName.trim().toUpperCase();
    const baseDesc = `SYNC: NF ${String(item.invoice_number || "").trim().toUpperCase()}`;

    // Garantir Subcategoria (CLIENTE)
    let subId = subsMap.get(clientName);
    if (!subId) {
      const { data: newSub, error: subErr } = await localSupabase
        .from("financial_subcategories")
        .insert({ name: clientName, category_id: catDataInc.id, user_id: uid })
        .select().single();
      if (subErr) throw subErr;
      subId = newSub.id;
      subsMap.set(clientName, subId);
    }

    const calc = calculateFactoring({
      invoiceValue: Number(item.invoice_value) || 0,
      operationDate: item.operation_date,
      monthlyRate: Number(item.monthly_rate) || 0,
      installments: (item.installments || []) as Installment[]
    });

    const occurredOn = item.operation_date;

    // Inserir Receita (Bruto)
    const { error: err1 } = await localSupabase.from("transactions").insert({
      user_id: uid,
      type: "income",
      nature: "variable",
      category: "ANTECIPAÇÃO DE NOTAS",
      category_id_v2: catDataInc.id,
      subcategory_id_v2: subId,
      description: baseDesc,
      amount: calc.totalInvoice,
      occurred_on: occurredOn,
    });
    if (err1) throw err1;

    // Inserir Despesa (Custo)
    const { error: err2 } = await localSupabase.from("transactions").insert({
      user_id: uid,
      type: "expense",
      nature: "variable",
      category: "CUSTO ANTECIPAÇÃO",
      category_id_v2: catDataExp.id,
      subcategory_id_v2: subId,
      description: baseDesc,
      amount: calc.operationCost,
      occurred_on: occurredOn,
    });
    if (err2) throw err2;

    console.log(`- Sincronizada NF ${item.invoice_number} | Bruto: ${calc.totalInvoice.toFixed(2)} | Desconto: ${calc.operationCost.toFixed(2)}`);
    successCount++;
  }

  console.log(`\nSincronizadas ${successCount} faturas.`);

  // 6. Consultar e somar novamente do local para verificar valores finais
  const { data: finalLocalTxs } = await localSupabase
    .from("transactions")
    .select("*")
    .eq("user_id", uid)
    .gte("occurred_on", "2026-03-01")
    .lte("occurred_on", "2026-03-31")
    .ilike("description", "SYNC: NF%");

  let grossTotal = 0;
  let discountTotal = 0;

  finalLocalTxs?.forEach(tx => {
    if (tx.type === "income") {
      grossTotal += tx.amount;
    } else {
      discountTotal += tx.amount;
    }
  });

  console.log(`\n=== VALORES FINAIS NO LOCAL (MARÇO 2026) ===`);
  console.log(`Receita Bruta Total: R$ ${grossTotal.toFixed(2)} (Esperado: R$ 143684.63)`);
  console.log(`Despesa Total: R$ ${discountTotal.toFixed(2)} (Esperado: R$ 5031.73)`);

  const tolerance = 0.01;
  const isRevenueCorrect = Math.abs(grossTotal - 143684.63) < tolerance;
  const isExpenseCorrect = Math.abs(discountTotal - 5031.73) < tolerance;

  if (isRevenueCorrect && isExpenseCorrect) {
    console.log("\n>>> SUCESSO! A INTEGRAÇÃO E OS VALORES ESTÃO 100% CORRETOS! <<<");
  } else {
    console.error("\n>>> ERRO! OS VALORES NÃO CONDIZEM COM O ESPERADO! <<<");
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
