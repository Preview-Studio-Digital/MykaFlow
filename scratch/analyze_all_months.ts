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
  console.log("=== COMPARANDO TODOS OS MESES ===");

  await localSupabase.auth.signInWithPassword({ email: LOCAL_CONFIG.email, password: LOCAL_CONFIG.password });
  await factoringSupabase.auth.signInWithPassword({ email: FACTORING_CONFIG.email, password: FACTORING_CONFIG.password });

  const { data: localTxs } = await localSupabase
    .from("transactions")
    .select("*")
    .or("description.ilike.SYNC%,description.ilike.%SYNC NF%");

  const [invRes, cliRes] = await Promise.all([
    factoringSupabase.from("invoices").select("*"),
    factoringSupabase.from("clients").select("id, name")
  ]);

  const clientsMap = new Map(cliRes.data?.map(c => [c.id, c.name]));
  const invoices = invRes.data || [];

  const months = ["2026-03", "2026-04", "2026-05", "2026-06"];

  for (const m of months) {
    console.log(`\n--- MÊS: ${m} ---`);

    // 1. Filtrar locais
    const mLocalTxs = (localTxs || []).filter(tx => tx.occurred_on && tx.occurred_on.startsWith(m));
    let localIncome = 0;
    let localExpense = 0;
    mLocalTxs.forEach(tx => {
      if (tx.type === "income") localIncome += tx.amount;
      else localExpense += tx.amount;
    });

    // 2. Calcular esperados externos
    const mInvoices = invoices.filter(inv => inv.operation_date && inv.operation_date.startsWith(m));
    let expectedGross = 0;
    let expectedCost = 0;

    mInvoices.forEach(inv => {
      const calc = calculateFactoring({
        invoiceValue: Number(inv.invoice_value) || 0,
        operationDate: inv.operation_date,
        monthlyRate: Number(inv.monthly_rate) || 0,
        installments: (inv.installments || []) as Installment[]
      });
      expectedGross += calc.totalInvoice;
      expectedCost += calc.operationCost;
    });

    console.log(`LOCAL ATUAL:   Receita: R$ ${localIncome.toFixed(2)} | Despesa: R$ ${localExpense.toFixed(2)}`);
    console.log(`ESPERADO EXT:  Receita: R$ ${expectedGross.toFixed(2)} | Despesa: R$ ${expectedCost.toFixed(2)}`);
    console.log(`DIFERENÇA:     Receita: R$ ${(localIncome - expectedGross).toFixed(2)} | Despesa: R$ ${(localExpense - expectedCost).toFixed(2)}`);
  }
}

run().catch(console.error);
