import { createClient } from "@supabase/supabase-js";

const FACTORING_CONFIG = {
  url: "https://wzxrhkjyxpphrclravfz.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo",
  email: "integracao@mykacompressores.com.br",
  password: "Senhadiego2307",
};

const factoringSupabase = createClient(FACTORING_CONFIG.url, FACTORING_CONFIG.key);

// Função para calcular dias úteis (business days) entre duas datas
function getBusinessDays(start: Date, end: Date): number {
  let count = 0;
  let cur = new Date(start.getTime());
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) { // não é domingo (0) nem sábado (6)
      count++;
    }
  }
  return count;
}

async function run() {
  const { data: extAuth } = await factoringSupabase.auth.signInWithPassword({
    email: FACTORING_CONFIG.email,
    password: FACTORING_CONFIG.password
  });

  const { data: invoices } = await factoringSupabase.from("invoices").select("*");
  const marchInvoices = (invoices || []).filter(inv => inv.operation_date && inv.operation_date.startsWith("2026-03"));

  const target = 5031.73;
  console.log(`Buscando fórmulas que cheguem a R$ ${target}...`);

  // Opções para testar:
  // 1. Qual taxa usar? 'factoring_monthly_rate' ou 'monthly_rate'
  // 2. Como calcular os dias? 'calendar' ou 'business'
  // 3. Ajuste nos dias: +0, +1, +2, -1
  // 4. Divisor: 30, 30.4167, 30.4375, 31, 360, 365
  // 5. Agrupamento: 'first_installment' (faturamento total na data da 1ª parcela) ou 'individual_installments' (cada parcela na sua data)
  // 6. Taxa extra (advalorem): 0% a 1.0% (passos de 0.05%)
  // 7. Tarifa fixa por boleto: R$ 0 a R$ 20 (passos de R$ 0.50)

  const ratesOpts = ['factoring_monthly_rate', 'monthly_rate'];
  const daysOpts = ['calendar', 'business'];
  const dayOffsets = [0, 1, 2, -1];
  const divisors = [30, 30.4167, 31];
  const groupOpts = ['first_installment', 'individual_installments'];
  const advaloremOpts = [0, 0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.009, 0.01];
  const fixedFeeOpts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

  let bestMatches: any[] = [];

  for (const rateKey of ratesOpts) {
    for (const daysType of daysOpts) {
      for (const offset of dayOffsets) {
        for (const div of divisors) {
          for (const group of groupOpts) {
            for (const advalorem of advaloremOpts) {
              for (const fixedFee of fixedFeeOpts) {
                let totalDiscount = 0;

                marchInvoices.forEach(inv => {
                  const rate = inv[rateKey] || 0;
                  const start = new Date(inv.operation_date);
                  
                  if (group === 'first_installment') {
                    const grossValue = inv.invoice_value || 0;
                    const firstInstallment = inv.installments?.[0] || {};
                    const dueDateStr = firstInstallment.dueDate || inv.operation_date;
                    const end = new Date(dueDateStr);
                    
                    let days = 0;
                    if (daysType === 'calendar') {
                      days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)));
                    } else {
                      days = getBusinessDays(start, end);
                    }
                    days = Math.max(0, days + offset);

                    // Desconto = Valor * TaxaMensal * (Dias / Divisor)
                    const interest = grossValue * (rate / 100) * (days / div);
                    // Advalorem = Valor * advalorem
                    const advVal = grossValue * advalorem;
                    // Tarifa = tarifa fixa por boleto/parcela (aqui é 1 boleto total)
                    const fee = fixedFee;

                    totalDiscount += interest + advVal + fee;

                  } else {
                    // Parcelas individuais
                    const installments = inv.installments || [];
                    installments.forEach((inst: any) => {
                      const val = inst.value || 0;
                      const dueDateStr = inst.dueDate || inv.operation_date;
                      const end = new Date(dueDateStr);
                      
                      let days = 0;
                      if (daysType === 'calendar') {
                        days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)));
                      } else {
                        days = getBusinessDays(start, end);
                      }
                      days = Math.max(0, days + offset);

                      const interest = val * (rate / 100) * (days / div);
                      const advVal = val * advalorem;
                      // Tarifa fixa é cobrada por boleto (cada parcela é um boleto)
                      const fee = fixedFee;

                      totalDiscount += interest + advVal + fee;
                    });
                  }
                });

                const diff = Math.abs(totalDiscount - target);
                if (diff < 20) { // Limite de tolerância de R$ 20
                  bestMatches.push({
                    rateKey,
                    daysType,
                    offset,
                    div,
                    group,
                    advalorem,
                    fixedFee,
                    totalDiscount,
                    diff
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  // Ordenar por menor diferença
  bestMatches.sort((a, b) => a.diff - b.diff);

  console.log(`\nEncontradas ${bestMatches.length} combinações próximas. Top 5:`);
  bestMatches.slice(0, 5).forEach((m, idx) => {
    console.log(`\nMatch #${idx + 1}:`);
    console.log(`- Taxa base: ${m.rateKey}`);
    console.log(`- Tipo de dias: ${m.daysType} (offset: ${m.offset >= 0 ? '+' : ''}${m.offset})`);
    console.log(`- Divisor mensal: ${m.div}`);
    console.log(`- Agrupamento: ${m.group}`);
    console.log(`- Advalorem: ${(m.advalorem * 100).toFixed(2)}%`);
    console.log(`- Tarifa fixa/boleto: R$ ${m.fixedFee}`);
    console.log(`- Calculado: R$ ${m.totalDiscount.toFixed(2)} (Diferença: R$ ${m.diff.toFixed(2)})`);
  });
}

run();
