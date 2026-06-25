import { createClient } from "@supabase/supabase-js";

const FACTORING_CONFIG = {
  url: "https://wzxrhkjyxpphrclravfz.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo",
  email: "integracao@mykacompressores.com.br",
  password: "Senhadiego2307",
};

const factoringSupabase = createClient(FACTORING_CONFIG.url, FACTORING_CONFIG.key);

async function run() {
  console.log("=== COMPARAÇÃO COM TAXA MENSAL SIMPLES (monthly_rate) ===");

  const { data: extAuth } = await factoringSupabase.auth.signInWithPassword({
    email: FACTORING_CONFIG.email,
    password: FACTORING_CONFIG.password
  });

  const { data: invoices } = await factoringSupabase.from("invoices").select("*");

  const marchInvoices = (invoices || []).filter(inv => inv.operation_date && inv.operation_date.startsWith("2026-03"));

  let totalDiscountFirstWithMonthlyRate = 0;
  let totalDiscountIndividualWithMonthlyRate = 0;

  marchInvoices.forEach(inv => {
    const grossValue = inv.invoice_value || 0;
    const rate = inv.monthly_rate || 0; // Usando monthly_rate diretamente
    const start = new Date(inv.operation_date);

    // Método 1: Primeira Parcela
    const firstInstallment = inv.installments?.[0] || {};
    const firstDueDate = firstInstallment.dueDate || "---";
    const endFirst = new Date(firstDueDate);
    const diffDaysFirst = Math.max(0, Math.ceil((endFirst.getTime() - start.getTime()) / (1000 * 3600 * 24)));
    const discountFirst = grossValue * (rate / 100) * (diffDaysFirst / 30);
    totalDiscountFirstWithMonthlyRate += discountFirst;

    // Método 2: Por Parcela Individual
    let invDiscountIndividual = 0;
    const installmentsList = inv.installments || [];
    installmentsList.forEach((inst: any) => {
      const instValue = inst.value || 0;
      const instDueDate = inst.dueDate || "---";
      const endInst = new Date(instDueDate);
      const diffDaysInst = Math.max(0, Math.ceil((endInst.getTime() - start.getTime()) / (1000 * 3600 * 24)));
      const discountInst = instValue * (rate / 100) * (diffDaysInst / 30);
      invDiscountIndividual += discountInst;
    });
    totalDiscountIndividualWithMonthlyRate += invDiscountIndividual;

    console.log(`NF: ${inv.invoice_number} | Bruto: ${grossValue.toFixed(2)} | monthly_rate: ${rate}%`);
    console.log(`  - Primeira Parcela com monthly_rate: R$ ${discountFirst.toFixed(2)}`);
    console.log(`  - Parcelas Individuais com monthly_rate: R$ ${invDiscountIndividual.toFixed(2)}`);
  });

  console.log("\n=== TOTALIZAÇÃO ===");
  console.log(`Primeira Parcela (com monthly_rate): R$ ${totalDiscountFirstWithMonthlyRate.toFixed(2)}`);
  console.log(`Parcelas Individuais (com monthly_rate): R$ ${totalDiscountIndividualWithMonthlyRate.toFixed(2)}`);
  console.log(`Valor Esperado pelo Usuário: R$ 5031.73`);
}

run();
