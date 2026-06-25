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
  key: process.env.SUPABASE_ANON_KEY || ""
};

const USERS = [
  { email: "diegooaraujoo2307@gmail.com", password: "Senhadiego2307" },
  { email: "michely@mykacompressores.com.br", password: "MykaFlow2026" }
];

const FACTORING_CONFIG = {
  url: "https://wzxrhkjyxpphrclravfz.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo",
  email: "integracao@mykacompressores.com.br",
  password: "Senhadiego2307"
};

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

const EXPECTED_VALUES = {
  "2026-03": { gross: 143684.63, cost: 5031.73 },
  "2026-04": { gross: 191872.22, cost: 7204.18 },
  "2026-05": { gross: 153836.53, cost: 5552.67 },
  "2026-06": { gross: 159309.55, cost: 4151.79 }
};

async function run() {
  console.log("=== SINCRONIZANDO E CORRIGINDO TODOS OS MESES PARA MÚLTIPLOS USUÁRIOS ===");

  console.log("Autenticando no Supabase Externo...");
  const extAuth = await factoringSupabase.auth.signInWithPassword({ email: FACTORING_CONFIG.email, password: FACTORING_CONFIG.password });
  if (extAuth.error) throw new Error("Erro login externo: " + extAuth.error.message);

  // Buscar dados externos uma única vez
  console.log("Buscando faturas e clientes do MykaCash...");
  const [invRes, cliRes] = await Promise.all([
    factoringSupabase.from("invoices").select("*"),
    factoringSupabase.from("clients").select("id, name")
  ]);

  if (invRes.error) throw invRes.error;
  if (cliRes.error) throw cliRes.error;

  const clientsMap = new Map(cliRes.data?.map(c => [c.id, c.name]));
  const invoices = invRes.data || [];

  for (const userCreds of USERS) {
    console.log(`\n>>> PROCESSANDO USUÁRIO: ${userCreds.email} <<<`);
    const localSupabase = createClient(LOCAL_CONFIG.url, LOCAL_CONFIG.key);
    
    console.log("Autenticando no Supabase Local...");
    const localAuth = await localSupabase.auth.signInWithPassword({ email: userCreds.email, password: userCreds.password });
    if (localAuth.error) {
      console.warn(`Aviso: Não foi possível autenticar como ${userCreds.email}: ${localAuth.error.message}`);
      continue;
    }
    const uid = localAuth.data.user.id;

    // Limpar transações
    console.log("Limpando transações anteriores de Março, Abril, Maio e Junho 2026...");
    const deleteFilters = ["SYNC%", "%SYNC NF%"];
    let totalDeleted = 0;
    for (const pattern of deleteFilters) {
      const { count, error } = await localSupabase
        .from("transactions")
        .delete({ count: "exact" })
        .eq("user_id", uid)
        .gte("occurred_on", "2026-03-01")
        .lte("occurred_on", "2026-06-30")
        .ilike("description", pattern);
      if (error) throw error;
      totalDeleted += count || 0;
    }
    console.log(`Deletadas ${totalDeleted} transações anteriores do banco local.`);

    // Buscar categorias locais
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
      throw new Error("Categorias financeiras não encontradas!");
    }

    const { data: currentSubs } = await localSupabase
      .from("financial_subcategories")
      .select("id, name")
      .eq("category_id", catDataInc.id);

    const subsMap = new Map(currentSubs?.map(s => [s.name.toUpperCase(), s.id]) || []);

    const months = ["2026-03", "2026-04", "2026-05", "2026-06"];
    
    for (const m of months) {
      console.log(`  Sincronizando mês ${m}...`);
      const mInvoices = invoices.filter(inv => inv.operation_date && inv.operation_date.startsWith(m));

      if (mInvoices.length === 0) continue;

      let totalUnroundedCost = 0;
      const itemsToInsert: any[] = [];

      for (const item of mInvoices) {
        const calc = calculateFactoring({
          invoiceValue: Number(item.invoice_value) || 0,
          operationDate: item.operation_date,
          monthlyRate: Number(item.monthly_rate) || 0,
          installments: (item.installments || []) as Installment[]
        });

        totalUnroundedCost += calc.operationCost;

        itemsToInsert.push({
          invoice: item,
          gross: Math.round(calc.totalInvoice * 100) / 100,
          cost: Math.round(calc.operationCost * 100) / 100
        });
      }

      // Ajuste
      const expectedMonthlyCost = Math.round(totalUnroundedCost * 100) / 100;
      const sumOfRoundedCosts = itemsToInsert.reduce((sum, item) => sum + item.cost, 0);
      const roundingDiff = Math.round((expectedMonthlyCost - sumOfRoundedCosts) * 100) / 100;

      if (roundingDiff !== 0 && itemsToInsert.length > 0) {
        const lastIndex = itemsToInsert.length - 1;
        itemsToInsert[lastIndex].cost = Math.round((itemsToInsert[lastIndex].cost + roundingDiff) * 100) / 100;
      }

      // Inserir
      for (const item of itemsToInsert) {
        const rawClientName = clientsMap.get(item.invoice.client_id) || "Cliente Desconhecido";
        const clientName = rawClientName.trim().toUpperCase();
        const baseDesc = `SYNC: NF ${String(item.invoice.invoice_number || "").trim().toUpperCase()}`;

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

        const occurredOn = item.invoice.operation_date;

        await localSupabase.from("transactions").insert({
          user_id: uid,
          type: "income",
          nature: "variable",
          category: "ANTECIPAÇÃO DE NOTAS",
          category_id_v2: catDataInc.id,
          subcategory_id_v2: subId,
          description: baseDesc,
          amount: item.gross,
          occurred_on: occurredOn,
        });

        await localSupabase.from("transactions").insert({
          user_id: uid,
          type: "expense",
          nature: "variable",
          category: "CUSTO ANTECIPAÇÃO",
          category_id_v2: catDataExp.id,
          subcategory_id_v2: subId,
          description: baseDesc,
          amount: item.cost,
          occurred_on: occurredOn,
        });
      }
    }

    // Verificar
    const { data: finalLocalTxs } = await localSupabase
      .from("transactions")
      .select("*")
      .eq("user_id", uid)
      .gte("occurred_on", "2026-03-01")
      .lte("occurred_on", "2026-06-30")
      .ilike("description", "SYNC: NF%");

    console.log(`=== VALORES FINAIS PARA ${userCreds.email} ===`);
    for (const m of months) {
      const mTxs = finalLocalTxs?.filter(t => t.occurred_on && t.occurred_on.startsWith(m)) || [];
      let grossSum = 0;
      let costSum = 0;
      mTxs.forEach(t => {
        if (t.type === "income") grossSum += t.amount;
        else costSum += t.amount;
      });
      console.log(`  Mês ${m}: Receita: R$ ${grossSum.toFixed(2)} | Custo: R$ ${costSum.toFixed(2)}`);
    }
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
