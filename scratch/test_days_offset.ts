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

  let totalDiscountDaysPlus1 = 0;
  
  marchInvoices.forEach(inv => {
    const start = new Date(inv.operation_date);
    const rate = inv.monthly_rate || 0; // 3%
    let invTotal = 0;

    const installments = inv.installments || [];
    installments.forEach((inst: any) => {
      const val = inst.value || 0;
      const dueDateStr = inst.dueDate || inv.operation_date;
      const end = new Date(dueDateStr);
      // dias + 1
      const days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24))) + 1;

      const discount = val * (rate / 100) * (days / 30);
      invTotal += discount;
    });

    totalDiscountDaysPlus1 += invTotal;
  });

  console.log(`Total com dias + 1 (taxa 3%): R$ ${totalDiscountDaysPlus1.toFixed(2)}`);
  console.log(`Valor Esperado: R$ 5031.73`);
}

run();
