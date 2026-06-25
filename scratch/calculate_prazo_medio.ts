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

  let totalGross = 0;
  let totalWeightedDays = 0;

  marchInvoices.forEach(inv => {
    const start = new Date(inv.operation_date);
    const installments = inv.installments || [];
    installments.forEach((inst: any) => {
      const val = inst.value || 0;
      const dueDateStr = inst.dueDate || inv.operation_date;
      const end = new Date(dueDateStr);
      const days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)));

      totalGross += val;
      totalWeightedDays += val * days;
    });
  });

  const prazoMedio = totalWeightedDays / totalGross;
  console.log(`Receita Bruta Total: R$ ${totalGross.toFixed(2)}`);
  console.log(`Prazo Médio Ponderado: ${prazoMedio.toFixed(2)} dias`);

  // Desconto esperado usando a taxa factoring (3.74%) e simples interest
  const rateFactoring = 3.74;
  const descFactoring = totalGross * (rateFactoring / 100) * (prazoMedio / 30);
  console.log(`Desconto com taxa factoring (3.74%) e prazo médio: R$ ${descFactoring.toFixed(2)}`);

  // Desconto esperado usando a taxa mensal (3.0%) e simples interest
  const rateMensal = 3.0;
  const descMensal = totalGross * (rateMensal / 100) * (prazoMedio / 30);
  console.log(`Desconto com taxa mensal (3.0%) e prazo médio: R$ ${descMensal.toFixed(2)}`);

  // Se o divisor for 31 ou 30.4167
  console.log(`Desconto com taxa mensal (3.0%) e divisor 31: R$ ${(totalGross * (rateMensal / 100) * (prazoMedio / 31)).toFixed(2)}`);
}

run();
