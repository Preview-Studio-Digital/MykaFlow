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

const localSupabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_ANON_KEY || "");

const credentials = [
  { email: "integracao@mykacompressores.com.br", password: "Senhadiego2307" },
  { email: "michely@mykacompressores.com.br", password: "MykaFlow2026" },
  { email: "michely@mykacompressores.com.br", password: "Senhadiego2307" },
  { email: "diegooaraujoo2307@gmail.com", password: "Senhadiego2307" } // possible developer email
];

async function run() {
  for (const cred of credentials) {
    console.log(`Tentando login com ${cred.email}...`);
    const { data, error } = await localSupabase.auth.signInWithPassword({
      email: cred.email,
      password: cred.password
    });
    if (error) {
      console.log(`Falha: ${error.message}`);
    } else {
      console.log(`SUCESSO! Logado como ${data.user?.email}`);
      
      // Consultar perfil para ver se temos acesso a perfis
      const { data: profs } = await localSupabase.from("profiles").select("*");
      console.log("Perfis acessíveis:", profs);
      
      // Consultar transações de Março de 2026
      const { data: txs } = await localSupabase.from("transactions").select("*").gte("occurred_on", "2026-03-01").lte("occurred_on", "2026-03-31");
      console.log("Transações em Março:", txs?.length);
      if (txs && txs.length > 0) {
        console.log("Exemplo de transações:");
        console.log(txs.slice(0, 5));
      }
      break;
    }
  }
}

run();
