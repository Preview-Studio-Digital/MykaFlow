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
    const { userId } = context;

    // Verify caller is admin (RLS-scoped client)
    const { data: roleRow, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr || !roleRow) {
      throw new Response("Forbidden: admin only", { status: 403 });
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (error) throw new Response(error.message, { status: 400 });

    // Cria o perfil na tabela 'profiles' e o papel inicial
    if (created.user) {
      await Promise.all([
        supabaseAdmin.from("profiles").upsert({
          id: created.user.id,
          display_name: data.displayName.toUpperCase(),
          email: data.email
        }),
        supabaseAdmin.from("user_roles").upsert({
          user_id: created.user.id,
          role: "user"
        })
      ]);
    }

    return { id: created.user?.id ?? null, email: data.email };
  });

export const promoteToAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    // Atribui o papel de admin para o usuário atual
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" });
    
    if (error) throw new Response(error.message, { status: 400 });
    return { success: true };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Apenas admins podem ver a lista
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) throw new Response("Forbidden", { status: 403 });

    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw new Response(error.message, { status: 400 });

    // Busca os cargos de todos os usuários de uma vez
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");

    return users.users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.user_metadata?.display_name || "Sem nome",
      role: roles?.find(r => r.user_id === u.id)?.role || "user",
      created_at: u.created_at
    }));
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => z.object({ targetUserId: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    // Proteção: não deixar se auto-excluir via admin API (melhor fazer via auth)
    if (data.targetUserId === context.userId) throw new Response("Self-deletion forbidden", { status: 400 });

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.targetUserId);
    if (error) throw new Response(error.message, { status: 400 });
    
    // Remove também da tabela de roles
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.targetUserId);

    return { success: true };
  });

export const adminUpdateRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => z.object({ targetUserId: z.string(), role: z.enum(["admin", "user"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.targetUserId, role: data.role });

    if (error) throw new Response(error.message, { status: 400 });
    return { success: true };
  });
