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

const localSupabase = createClient(LOCAL_CONFIG.url, LOCAL_CONFIG.key);

async function run() {
  await localSupabase.auth.signInWithPassword({ email: LOCAL_CONFIG.email, password: LOCAL_CONFIG.password });
  const { data: rows } = await localSupabase
    .from("transactions")
    .select("*")
    .gte("occurred_on", "2026-03-01")
    .lte("occurred_on", "2026-03-31")
    .ilike("description", "SYNC: NF%");

  if (!rows) return;

  const getSubcategoryName = (r: any) => "";
  const getDisplayDescription = (r: any) => {
    return (r.description || "").trim();
  };

  const sortedRows = [...rows].sort((a, b) => {
    // 1. data (ocorrido em) decrescente (mais recente primeiro)
    // 2. descrição crescente (agrupa descrições idênticas na mesma data)
    // 3. tipo decrescente (coloca receita antes de despesa, pois 'income' > 'expense' alfabeticamente)
    const dateA = new Date(a.occurred_on + "T00:00:00").getTime();
    const dateB = new Date(b.occurred_on + "T00:00:00").getTime();

    if (dateA !== dateB) {
      return dateB - dateA;
    }

    const descA = (a.description || "").trim().toUpperCase();
    const descB = (b.description || "").trim().toUpperCase();

    if (descA !== descB) {
      return descA.localeCompare(descB);
    }

    return b.type.localeCompare(a.type);
  });

  console.log("=== SIMULANDO ORDENAÇÃO ===");
  sortedRows.forEach(r => {
    console.log(`- Data: ${r.occurred_on} | Tipo: ${r.type.toUpperCase().padEnd(7)} | Desc: ${r.description} | Valor: R$ ${r.amount.toFixed(2)}`);
  });
}

run();
