import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    console.error("Arquivo .env não encontrado em:", envPath);
    return;
  }
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
};

const localSupabase = createClient(LOCAL_CONFIG.url, LOCAL_CONFIG.key);

async function run() {
  console.log("=== LISTANDO PERFIS DO BANCO LOCAL ===");
  const { data, error } = await localSupabase.from("profiles").select("*");
  if (error) {
    console.error("Erro ao ler tabela profiles:", error.message);
  } else {
    console.log("Perfis encontrados:", data);
  }
}

run();
