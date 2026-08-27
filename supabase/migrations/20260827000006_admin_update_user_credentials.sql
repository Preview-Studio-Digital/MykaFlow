-- ==============================================================================
-- MIGRAÇÃO: FUNÇÃO DE ATUALIZAÇÃO COMPLETA DE USUÁRIOS NO SUPABASE AUTH
-- Execute este script no SQL Editor do Supabase para sincronizar a edição
-- de Nome, E-mail e Senha pelo Administrador com o Supabase Auth (auth.users).
-- ==============================================================================

-- 1. Habilita extensão pgcrypto se ainda não estiver ativa (para crypt e gen_salt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Criação da função com privilégios de sistema (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.admin_update_user_credentials(
  target_user_id uuid,
  new_name text DEFAULT NULL,
  new_email text DEFAULT NULL,
  new_password text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_encrypted_pw text;
  v_clean_name text;
  v_clean_email text;
BEGIN
  v_clean_name := NULLIF(TRIM(UPPER(new_name)), '');
  v_clean_email := NULLIF(TRIM(LOWER(new_email)), '');

  -- 1. Atualiza a tabela pública profiles
  UPDATE public.profiles
  SET 
    display_name = COALESCE(v_clean_name, display_name),
    email = COALESCE(v_clean_email, email),
    updated_at = NOW()
  WHERE id = target_user_id;

  -- 2. Atualiza auth.users
  IF new_password IS NOT NULL AND TRIM(new_password) <> '' THEN
    v_encrypted_pw := crypt(TRIM(new_password), gen_salt('bf'));
    
    UPDATE auth.users
    SET 
      email = COALESCE(v_clean_email, email),
      encrypted_password = v_encrypted_pw,
      raw_user_meta_data = jsonb_set(
        COALESCE(raw_user_meta_data, '{}'::jsonb),
        '{display_name}',
        to_jsonb(COALESCE(v_clean_name, raw_user_meta_data->>'display_name', ''))
      ),
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      updated_at = NOW()
    WHERE id = target_user_id;
  ELSE
    UPDATE auth.users
    SET 
      email = COALESCE(v_clean_email, email),
      raw_user_meta_data = jsonb_set(
        COALESCE(raw_user_meta_data, '{}'::jsonb),
        '{display_name}',
        to_jsonb(COALESCE(v_clean_name, raw_user_meta_data->>'display_name', ''))
      ),
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      updated_at = NOW()
    WHERE id = target_user_id;
  END IF;

  -- 3. Atualiza auth.identities para refletir o novo email no provider de login
  IF v_clean_email IS NOT NULL THEN
    BEGIN
      UPDATE auth.identities
      SET 
        identity_data = jsonb_set(
          COALESCE(identity_data, '{}'::jsonb),
          '{email}',
          to_jsonb(v_clean_email)
        ),
        updated_at = NOW()
      WHERE user_id = target_user_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

END;
$$;

-- 3. Permite que usuários autenticados chamem a função
GRANT EXECUTE ON FUNCTION public.admin_update_user_credentials(uuid, text, text, text) TO authenticated, service_role;
