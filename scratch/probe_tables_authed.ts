import { createClient } from "@supabase/supabase-js";

const FACTORING_CONFIG = {
  url: "https://wzxrhkjyxpphrclravfz.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo",
  email: "integracao@mykacompressores.com.br",
  password: "Senhadiego2307",
};

const supabase = createClient(FACTORING_CONFIG.url, FACTORING_CONFIG.key);

async function probe() {
  console.log("Autenticando no MykaCash...");
  await supabase.auth.signInWithPassword({
    email: FACTORING_CONFIG.email,
    password: FACTORING_CONFIG.password
  });

  const common = [
    "invoices", "operations", "transactions", "clients", "customers", 
    "profiles", "accounts", "deals", "leads", "projects", "tasks",
    "faturas", "operacoes", "clientes", "lancamentos", "financeiro",
    "factoring_invoices", "factoring_operations", "factoring_clients"
  ];
  
  for (const table of common) {
    const { data, error } = await supabase.from(table).select("*").limit(0);
    if (!error) {
      const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
      console.log(`EXISTS: '${table}' (Count: ${count})`);
    }
  }
}

probe();
