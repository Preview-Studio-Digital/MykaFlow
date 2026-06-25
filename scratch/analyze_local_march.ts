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

async function run() {
  console.log("=== COMPARAÇÃO COMPLETA: LOCAL VS EXTERNO (MARÇO 2026) ===");

  // 1. Logins
  await localSupabase.auth.signInWithPassword({ email: LOCAL_CONFIG.email, password: LOCAL_CONFIG.password });
  await factoringSupabase.auth.signInWithPassword({ email: FACTORING_CONFIG.email, password: FACTORING_CONFIG.password });

  // 2. Fetch local transactions
  const { data: localTxs } = await localSupabase
    .from("transactions")
    .select("*")
    .gte("occurred_on", "2026-03-01")
    .lte("occurred_on", "2026-03-31");

  // 3. Fetch external data
  const [invRes, cliRes] = await Promise.all([
    factoringSupabase.from("invoices").select("*"),
    factoringSupabase.from("clients").select("id, name")
  ]);

  const clientsMap = new Map(cliRes.data?.map(c => [c.id, c.name]));
  const marchExtInvoices = (invRes.data || []).filter(inv => inv.operation_date && inv.operation_date.startsWith("2026-03"));

  console.log(`\n--- DADOS EXTERNOS DO MYKACASH (MARÇO) ---`);
  console.log(`Total faturas externas: ${marchExtInvoices.length}`);
  marchExtInvoices.forEach(inv => {
    const name = clientsMap.get(inv.client_id) || "Desconhecido";
    console.log(`- NF: ${inv.invoice_number} | Cliente: ${name} | Valor: R$ ${inv.invoice_value.toFixed(2)} | Data: ${inv.operation_date}`);
  });

  console.log(`\n--- DADOS LOCAIS DO MYKAFLOW (MARÇO) ---`);
  console.log(`Total transações locais: ${localTxs?.length || 0}`);
  
  let localIncomeSum = 0;
  let localExpenseSum = 0;

  localTxs?.sort((a,b) => a.description.localeCompare(b.description)).forEach(tx => {
    if (tx.type === 'income') localIncomeSum += tx.amount;
    else localExpenseSum += tx.amount;

    console.log(`- [${tx.type.toUpperCase()}] ID: ${tx.id} | Desc: ${tx.description} | Valor: R$ ${tx.amount.toFixed(2)} | Categoria: ${tx.category} | Data: ${tx.occurred_on}`);
  });

  console.log(`\n=== RESUMO DAS SOMAS ===`);
  console.log(`Local Receitas Total: R$ ${localIncomeSum.toFixed(2)}`);
  console.log(`Local Despesas Total: R$ ${localExpenseSum.toFixed(2)}`);
  
  // Achar duplicatas locais por descrição e tipo
  const counts = new Map<string, number>();
  localTxs?.forEach(tx => {
    const key = `${tx.type}:${tx.description}:${tx.amount}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  console.log(`\n--- DUPLICADAS LOCAIS DETECTADAS ---`);
  let hasDup = false;
  for (const [key, count] of counts.entries()) {
    if (count > 1) {
      console.log(`- ${key} aparece ${count} vezes!`);
      hasDup = true;
    }
  }
  if (!hasDup) console.log("Nenhuma duplicata com mesma descrição, tipo e valor encontrada.");
}

run();
