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
    .select("*, financial_subcategories:subcategory_id_v2(name)")
    .gte("occurred_on", "2026-06-01")
    .lte("occurred_on", "2026-06-30");

  if (!rows) return;

  console.log("=== TRANSAÇÕES DE JUNHO NO BANCO LOCAL ===");
  rows.forEach(r => {
    console.log(`ID: ${r.id} | Data: ${r.occurred_on} | Tipo: ${r.type.toUpperCase().padEnd(7)} | Desc: "${r.description}" | Sub: "${r.financial_subcategories?.name}" | Valor: R$ ${r.amount} | Criado: ${r.created_at}`);
  });
}

run();
