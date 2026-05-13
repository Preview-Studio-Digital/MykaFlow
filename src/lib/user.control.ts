
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  displayName: z.string().trim().min(1),
});

export const forceCreateUser = createServerFn({ method: "GET" })
  .handler(async (payload: any) => {
    // No método GET, os dados vêm diretamente no payload
    const data = payload;
    
    console.log("!!! DADOS BRUTOS RECEBIDOS:", payload);
    console.log("!!! DADOS EXTRAÍDOS:", data);
    
    if (!data || (!data.email && !payload.email)) {
      console.error("Servidor recebeu dados vazios!");
      throw new Response("Dados do formulário não chegaram no servidor", { status: 400 });
    }

    const emailToUse = data.email || payload.email;
    const passwordToUse = data.password || payload.password;
    const nameToUse = data.displayName || payload.displayName || data.name || payload.name;

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: emailToUse,
      password: passwordToUse,
      email_confirm: true,
      user_metadata: { display_name: nameToUse },
    });

    if (error) {
      console.error("Erro no Auth:", error.message);
      throw new Response(error.message, { status: 400 });
    }

    // Criar perfil e cargo
    await supabaseAdmin.from("profiles").upsert({
      id: created.user!.id,
      display_name: (nameToUse || "USUÁRIO").toUpperCase(),
      email: emailToUse
    });

    await supabaseAdmin.from("user_roles").upsert({
      user_id: created.user!.id,
      role: "user"
    });

    const { data: all } = await supabaseAdmin.auth.admin.listUsers();
    const count = all?.users?.length || 0;
    
    console.log("Criação finalizada. Total agora:", count);

    return { 
      success: true, 
      newId: created.user!.id,
      totalCount: count,
      msg: "Usuário criado com sucesso no novo motor!"
    };
  });
