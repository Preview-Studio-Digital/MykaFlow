import { createClient } from "@supabase/supabase-js";

const FACTORING_CONFIG = {
  url: "https://wzxrhkjyxpphrclravfz.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo",
  email: "integracao@mykacompressores.com.br",
  password: "Senhadiego2307",
};

const factoringSupabase = createClient(FACTORING_CONFIG.url, FACTORING_CONFIG.key);

// Copied from mykacash_oficial calc.ts
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

const calculate = (input: CalcInput) => {
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
    
    // Floor on effective rate per installment
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
  await factoringSupabase.auth.signInWithPassword({
    email: FACTORING_CONFIG.email,
    password: FACTORING_CONFIG.password
  });

  const { data: invoices } = await factoringSupabase.from("invoices").select("*");
  const marchInvoices = (invoices || []).filter(inv => inv.operation_date && inv.operation_date.startsWith("2026-03"));

  let totalGross = 0;
  let totalOperationCost = 0;

  marchInvoices.forEach(inv => {
    const calc = calculate({
      invoiceValue: Number(inv.invoice_value) || 0,
      operationDate: inv.operation_date,
      monthlyRate: Number(inv.monthly_rate) || 0,
      installments: (inv.installments || []) as Installment[]
    });

    totalGross += calc.totalInvoice;
    totalOperationCost += calc.operationCost;

    console.log(`NF ${inv.invoice_number} | Bruto: ${calc.totalInvoice.toFixed(2)} | Custo de Operação: ${calc.operationCost.toFixed(2)}`);
  });

  console.log(`\n=== RESULTADO COM O CÁLCULO ORIGINAL DO MYKACASH ===`);
  console.log(`Receita Bruta Total: R$ ${totalGross.toFixed(2)}`);
  console.log(`Custo de Operação Total (Despesa): R$ ${totalOperationCost.toFixed(2)}`);
  console.log(`Valor Esperado pelo Usuário: R$ 5031.73`);
}

run();
