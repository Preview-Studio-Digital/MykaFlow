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

  const target = 5031.73;

  // Para cada fatura, pré-calcular as 4 opções de desconto:
  // Option 0: First installment, factoring_monthly_rate (3.74%)
  // Option 1: Individual installments, factoring_monthly_rate (3.74%)
  // Option 2: First installment, monthly_rate (3.0%)
  // Option 3: Individual installments, monthly_rate (3.0%)
  const options = marchInvoices.map(inv => {
    const start = new Date(inv.operation_date);
    const fRate = inv.factoring_monthly_rate || 0;
    const mRate = inv.monthly_rate || 0;
    const gross = inv.invoice_value || 0;

    // Group 1: First
    const firstInst = inv.installments?.[0] || {};
    const dueDateFirst = firstInst.dueDate || inv.operation_date;
    const daysFirst = Math.max(0, Math.ceil((new Date(dueDateFirst).getTime() - start.getTime()) / (1000 * 3600 * 24)));
    const opt0 = gross * (fRate / 100) * (daysFirst / 30);
    const opt2 = gross * (mRate / 100) * (daysFirst / 30);

    // Group 2: Individual
    let opt1 = 0;
    let opt3 = 0;
    const installments = inv.installments || [];
    installments.forEach((inst: any) => {
      const val = inst.value || 0;
      const dueDateInst = inst.dueDate || inv.operation_date;
      const daysInst = Math.max(0, Math.ceil((new Date(dueDateInst).getTime() - start.getTime()) / (1000 * 3600 * 24)));
      opt1 += val * (fRate / 100) * (daysInst / 30);
      opt3 += val * (mRate / 100) * (daysInst / 30);
    });

    return {
      invoice_number: inv.invoice_number,
      client_id: inv.client_id,
      opt0, opt1, opt2, opt3
    };
  });

  console.log(`Buscando combinação exata de opções...`);
  // Faremos uma busca exaustiva (4^12 = 16.7 milhões de combinações)
  // Como são 12 faturas, é muito rápido em JavaScript.
  let found = false;
  let minDiff = 999999;
  let bestComb: number[] = [];

  function search(idx: number, currentSum: number, comb: number[]) {
    if (idx === options.length) {
      const diff = Math.abs(currentSum - target);
      if (diff < minDiff) {
        minDiff = diff;
        bestComb = [...comb];
      }
      if (diff < 0.01) {
        console.log(`COMBINAÇÃO EXATA ENCONTRADA!`);
        comb.forEach((optIdx, i) => {
          const opt = options[i];
          const val = optIdx === 0 ? opt.opt0 : optIdx === 1 ? opt.opt1 : optIdx === 2 ? opt.opt2 : opt.opt3;
          console.log(`NF ${opt.invoice_number}: Opção ${optIdx} (R$ ${val.toFixed(2)})`);
        });
        found = true;
      }
      return;
    }

    if (found) return;

    // Testar as 4 opções
    const opt = options[idx];
    search(idx + 1, currentSum + opt.opt0, [...comb, 0]);
    search(idx + 1, currentSum + opt.opt1, [...comb, 1]);
    search(idx + 1, currentSum + opt.opt2, [...comb, 2]);
    search(idx + 1, currentSum + opt.opt3, [...comb, 3]);
  }

  search(0, 0, []);

  if (!found) {
    console.log(`Nenhuma combinação exata encontrada. Melhor aproximação (Diferença: R$ ${minDiff.toFixed(4)}):`);
    bestComb.forEach((optIdx, i) => {
      const opt = options[i];
      const val = optIdx === 0 ? opt.opt0 : optIdx === 1 ? opt.opt1 : optIdx === 2 ? opt.opt2 : opt.opt3;
      console.log(`NF ${opt.invoice_number}: Opção ${optIdx} (R$ ${val.toFixed(2)})`);
    });
  }
}

run();
