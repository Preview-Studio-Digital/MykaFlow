import { createClient } from "@supabase/supabase-js";

const factoringUrl = "https://wzxrhkjyxpphrclravfz.supabase.co";
const factoringKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo";

const supabase = createClient(factoringUrl, factoringKey);

async function probe() {
  console.log("Probing other Supabase project...");
  
  const tables = [
    "operations", "invoices", "transactions", 
    "operacoes", "faturas", "duplicatas", 
    "factoring", "financeiro", "lancamentos",
    "operacoes_factoring", "clientes"
  ];
  
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select("*").limit(5);
    if (!error) {
      console.log(`SUCCESS: Found table '${table}'`);
      if (data && data.length > 0) {
        console.log(`Column names for '${table}':`, Object.keys(data[0]));
        console.log("Sample row:", data[0]);
      } else {
        console.log(`Table '${table}' is EMPTY.`);
      }
    }
  }
}

probe();
