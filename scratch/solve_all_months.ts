import { createClient } from "@supabase/supabase-js";

const FACTORING_CONFIG = {
  url: "https://wzxrhkjyxpphrclravfz.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo",
  email: "integracao@mykacompressores.com.br",
  password: "Senhadiego2307",
};

const factoringSupabase = createClient(FACTORING_CONFIG.url, FACTORING_CONFIG.key);

async function run() {
  await factoringSupabase.auth.signInWithPassword({
    email: FACTORING_CONFIG.email,
    password: FACTORING_CONFIG.password
  });

  const { data: invoices } = await factoringSupabase.from("invoices").select("*");

  const months = ["2026-03", "2026-04", "2026-05", "2026-06"];

  months.forEach(ym => {
    const ymInvoices = (invoices || []).filter(inv => inv.operation_date && inv.operation_date.startsWith(ym));
    
    let grossTotal = 0;
    
    // Formula 1: First installment, factoring_monthly_rate
    let f1 = 0;
    // Formula 2: Individual installments, factoring_monthly_rate
    let f2 = 0;
    // Formula 3: First installment, monthly_rate
    let f3 = 0;
    // Formula 4: Individual installments, monthly_rate
    let f4 = 0;

    ymInvoices.forEach(inv => {
      grossTotal += inv.invoice_value || 0;
      const start = new Date(inv.operation_date);

      // Rates
      const fRate = inv.factoring_monthly_rate || 0;
      const mRate = inv.monthly_rate || 0;

      // Group 1: First installment
      const firstInst = inv.installments?.[0] || {};
      const dueDateFirst = firstInst.dueDate || inv.operation_date;
      const endFirst = new Date(dueDateFirst);
      const daysFirst = Math.max(0, Math.ceil((endFirst.getTime() - start.getTime()) / (1000 * 3600 * 24)));
      
      f1 += (inv.invoice_value || 0) * (fRate / 100) * (daysFirst / 30);
      f3 += (inv.invoice_value || 0) * (mRate / 100) * (daysFirst / 30);

      // Group 2: Individual installments
      const installments = inv.installments || [];
      installments.forEach((inst: any) => {
        const val = inst.value || 0;
        const dueDateStr = inst.dueDate || inv.operation_date;
        const endInst = new Date(dueDateStr);
        const daysInst = Math.max(0, Math.ceil((endInst.getTime() - start.getTime()) / (1000 * 3600 * 24)));

        f2 += val * (fRate / 100) * (daysInst / 30);
        f4 += val * (mRate / 100) * (daysInst / 30);
      });
    });

    console.log(`\n=== MÊS: ${ym} (Faturas: ${ymInvoices.length}, Receita Bruta: R$ ${grossTotal.toFixed(2)}) ===`);
    console.log(`- F1 (1ª Parc, taxa factoring): R$ ${f1.toFixed(2)}`);
    console.log(`- F2 (Indiv Parc, taxa factoring): R$ ${f2.toFixed(2)}`);
    console.log(`- F3 (1ª Parc, taxa mensal): R$ ${f3.toFixed(2)}`);
    console.log(`- F4 (Indiv Parc, taxa mensal): R$ ${f4.toFixed(2)}`);
  });
}

run();
