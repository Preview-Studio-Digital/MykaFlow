-- ==============================================================================
-- MIGRAÇÃO DE SINCRONIZAÇÃO E CORREÇÃO DE RLS DE PERFIS
-- Execute no SQL Editor do Supabase para sincronizar todos os usuários existentes
-- ==============================================================================

-- 1. Permissões de RLS para a tabela profiles: permitir que administradores autenticados gerenciem perfis
DROP POLICY IF EXISTS "Profiles insert self" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update self" ON public.profiles;
DROP POLICY IF EXISTS "Profiles Auth All" ON public.profiles;
DROP POLICY IF EXISTS "Profiles write authenticated" ON public.profiles;

CREATE POLICY "Profiles select authenticated" ON public.profiles 
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Profiles insert authenticated" ON public.profiles 
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Profiles update authenticated" ON public.profiles 
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Profiles delete authenticated" ON public.profiles 
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- 2. Função SECURITY DEFINER para sincronizar todos os usuários de auth.users para profiles e user_roles
CREATE OR REPLACE FUNCTION public.sync_auth_users_to_profiles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insere na tabela profiles todos os usuários que estão em auth.users mas não possuem perfil
  INSERT INTO public.profiles (id, display_name, email)
  SELECT 
    u.id, 
    COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)), 
    u.email
  FROM auth.users u
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);

  -- Insere na tabela user_roles para quem não possui papel configurado
  INSERT INTO public.user_roles (user_id, role)
  SELECT 
    u.id, 
    'user'::public.app_role
  FROM auth.users u
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Liberar execução para autenticados e anon
-- 3. Função SECURITY DEFINER para exclusão definitiva de usuário (incluindo auth.users)
CREATE OR REPLACE FUNCTION public.delete_user_completely(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Desvincula chaves estrangeiras que poderiam impedir a exclusão
  UPDATE public.crm_deals SET assigned_user_id = NULL WHERE assigned_user_id = target_user_id;
  UPDATE public.crm_deals SET user_id = auth.uid() WHERE user_id = target_user_id;
  UPDATE public.crm_deal_history SET user_id = NULL WHERE user_id = target_user_id;
  UPDATE public.crm_customers SET user_id = NULL WHERE user_id = target_user_id;
  UPDATE public.financial_categories SET user_id = NULL WHERE user_id = target_user_id;
  UPDATE public.financial_subcategories SET user_id = NULL WHERE user_id = target_user_id;

  -- Remove de tabelas públicas
  DELETE FROM public.user_roles WHERE user_id = target_user_id;
  DELETE FROM public.profiles WHERE id = target_user_id;

  -- Remove DEFINITIVAMENTE da autenticação Supabase
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_completely(uuid) TO authenticated, service_role;

-- 4. Executa a sincronização imediatamente
SELECT public.sync_auth_users_to_profiles();
