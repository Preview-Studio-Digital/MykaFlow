import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  displayName: z.string().trim().min(1).max(100),
});

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { userId } = context;

      // Verify caller is admin using admin client to bypass any RLS issues
      const { data: roleRow, error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (roleErr || !roleRow) {
        console.error("Acesso negado: Usuário não é admin ou erro na tabela roles", roleErr);
        throw new Response("Forbidden: admin only", { status: 403 });
      }

      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { display_name: data.displayName },
      });

      if (error) {
        console.error("Erro Supabase Auth:", error);
        throw new Response(error.message || "Erro desconhecido no Auth", { status: 400 });
      }

      // Garantindo que o perfil e a role existam mesmo que o trigger falhe
      if (created.user) {
        console.log("Criando perfil e cargo manualmente para:", created.user.id);
        const { error: profileErr } = await supabaseAdmin.from("profiles").upsert({
          id: created.user.id,
          display_name: data.displayName.toUpperCase(),
          email: data.email,
        });
        if (profileErr) console.warn("Erro ao criar perfil manual:", profileErr.message);

        const { error: roleErr } = await supabaseAdmin.from("user_roles").upsert(
          {
            user_id: created.user.id,
            role: "user",
          },
          { onConflict: "user_id,role" },
        );
        if (roleErr) console.warn("Erro ao criar cargo manual:", roleErr.message);
      }

      // Diagnóstico: Contar total de usuários após criação
      const { data: allUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) {
        console.error("Erro no diagnóstico listUsers:", listError.message);
        return {
          id: created.user?.id ?? null,
          email: data.email,
          totalCount: `ERRO: ${listError.message}`,
        };
      }

      const total = allUsers?.users?.length || 0;
      console.log(`Total de usuários no Auth após criação: ${total}`);

      return {
        id: created.user?.id ?? null,
        email: data.email,
        totalCount: total,
      };
    } catch (err: any) {
      console.error("CRASH na criação de usuário:", err);
      // Retorna o erro como texto para evitar a página HTML do Vite
      throw new Response(err.message || "Erro interno no servidor", { status: 500 });
    }
  });

export const promoteToAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    // 1. Remove qualquer cargo existente para evitar duplicidade
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);

    // 2. Atribui o papel de admin de forma limpa
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });

    if (error) {
      console.error("Erro ao promover para admin:", error.message);
      throw new Response(error.message, { status: 400 });
    }

    console.log(`Usuário ${userId} promovido a ADMIN com sucesso!`);
    return { success: true };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    /* Temporariamente desativado para diagnóstico
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      console.warn("listUsers: Usuário não é admin");
      throw new Response("Acesso Negado: Seu usuário não tem cargo de ADMIN. Clique em 'Tornar-me Administrador' no painel acima para liberar a lista.", { status: 403 });
    }
    */
    console.log("DIAGNÓSTICO: Buscando lista completa sem trava de admin...");

    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      console.error("!!! ERRO CRÍTICO NO SUPABASE ADMIN:", error.message);
      throw new Response(`Erro Supabase: ${error.message}`, { status: 500 });
    }

    const totalCount = users?.users?.length || 0;
    console.log("*************************************************");
    console.log(`* DIAGNÓSTICO DE EQUIPE: Encontrados ${totalCount} usuários`);
    console.log(`* PROJETO: ${process.env.SUPABASE_URL}`);
    console.log("*************************************************");

    // Busca os cargos de todos os usuários de uma vez
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");

    return users.users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.user_metadata?.display_name || "Sem nome",
      role: roles?.find((r) => r.user_id === u.id)?.role || "user",
      created_at: u.created_at,
    }));
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => z.object({ targetUserId: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    // Proteção: não deixar se auto-excluir via admin API (melhor fazer via auth)
    if (data.targetUserId === context.userId)
      throw new Response("Self-deletion forbidden", { status: 400 });

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.targetUserId);
    if (error) throw new Response(error.message, { status: 400 });

    // Remove também da tabela de roles
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.targetUserId);

    return { success: true };
  });

export const adminUpdateRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) =>
    z.object({ targetUserId: z.string(), role: z.enum(["admin", "user"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.targetUserId, role: data.role }, { onConflict: "user_id" });

    if (error) throw new Response(error.message, { status: 400 });
    return { success: true };
  });

export const adminUpdateName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) =>
    z.object({ targetUserId: z.string(), name: z.string().trim().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ display_name: data.name.toUpperCase() })
      .eq("id", data.targetUserId);

    if (error) throw new Response(error.message, { status: 400 });
    return { success: true };
  });

