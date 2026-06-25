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
  const marchInvoices = (invoices || []).filter(inv => inv.operation_date && inv.operation_date.startsWith("2026-03"));

  console.log("=== CÁLCULO DE DESCONTO COM INTERESSE (3%) + IOF ===");
  
  // IOF: 0.38% fixo + 0.0041% ao dia (simplificado para PJ)
  let totalDiscountWithIOF = 0;
  
  marchInvoices.forEach(inv => {
    const start = new Date(inv.operation_date);
    const mRate = inv.monthly_rate || 0; // 3%
    let invTotal = 0;

    const installments = inv.installments || [];
    installments.forEach((inst: any) => {
      const val = inst.value || 0;
      const dueDateStr = inst.dueDate || inv.operation_date;
      const end = new Date(dueDateStr);
      const days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)));

      // Juros
      const interest = val * (mRate / 100) * (days / 30);
      // IOF Fixo (0.38%)
      const iofFixed = val * 0.0038;
      // IOF Diário (0.0041% ao dia)
      const iofDaily = val * 0.000041 * days;

      const instDiscount = interest + iofFixed + iofDaily;
      invTotal += instDiscount;
    });

    totalDiscountWithIOF += invTotal;
    console.log(`NF: ${inv.invoice_number} | Bruto: ${inv.invoice_value.toFixed(2)} | Desconto+IOF: ${invTotal.toFixed(2)}`);
  });

  console.log(`\nTotal com IOF (PJ): R$ ${totalDiscountWithIOF.toFixed(2)}`);
  console.log(`Valor Esperado: R$ 5031.73`);
  
  // E se for IOF de Pessoa Física (0.38% fixo + 0.0082% ao dia)?
  let totalDiscountWithIOFPF = 0;
  marchInvoices.forEach(inv => {
    const start = new Date(inv.operation_date);
    const mRate = inv.monthly_rate || 0;
    let invTotal = 0;

    const installments = inv.installments || [];
    installments.forEach((inst: any) => {
      const val = inst.value || 0;
      const dueDateStr = inst.dueDate || inv.operation_date;
      const end = new Date(dueDateStr);
      const days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)));

      const interest = val * (mRate / 100) * (days / 30);
      const iofFixed = val * 0.0038;
      const iofDaily = val * 0.000082 * days; // PF dobro

      const instDiscount = interest + iofFixed + iofDaily;
      invTotal += instDiscount;
    });
    totalDiscountWithIOFPF += invTotal;
  });

  console.log(`Total com IOF (PF): R$ ${totalDiscountWithIOFPF.toFixed(2)}`);
}

run();
