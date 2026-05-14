import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("ERRO: Variáveis de ambiente faltando no .env!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createUser() {
  console.log("Iniciando criação de usuário via script...");

  const email = "michely@mykacompressores.com.br";
  const password = "MykaFlow2026";
  const name = "MICHELY";

  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  });

  if (error) {
    console.error("ERRO ao criar no Auth:", error.message);
    return;
  }

  console.log("Usuário criado no Auth com ID:", created.user.id);

  // Criar perfil e cargo manualmente
  const { error: profileErr } = await supabase.from("profiles").upsert({
    id: created.user.id,
    display_name: name,
    email: email,
  });

  if (profileErr) {
    console.error("ERRO ao criar perfil:", profileErr.message);
  } else {
    console.log("Perfil criado com sucesso!");
  }

  const { error: roleErr } = await supabase.from("user_roles").upsert({
    user_id: created.user.id,
    role: "user",
  });

  if (roleErr) {
    console.error("ERRO ao criar cargo:", roleErr.message);
  } else {
    console.log("Cargo 'user' atribuído com sucesso!");
  }

  console.log("\nFINALIZADO: Michely deve conseguir logar agora.");
}

createUser();
