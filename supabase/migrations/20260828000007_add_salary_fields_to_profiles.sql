-- ==============================================================================
-- MIGRAÇÃO: ADICIONAR CAMPOS DE SALÁRIO E ENCARGOS NA TABELA PROFILES
-- E ATUALIZAR FUNÇÃO RPC DE EDIÇÃO DE USUÁRIOS
-- ==============================================================================

-- 1. Habilitar extensão pgcrypto se ainda não estiver ativa
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Adicionar colunas de remuneração e encargos na tabela profiles (se não existirem)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS base_salary NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charges_multiplier NUMERIC(5,2) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS monthly_hours NUMERIC(5,2) DEFAULT 160;

-- 3. Permitir que crm_deal_history aceite deal_id NULL para eventos gerais (opcional e seguro)
ALTER TABLE public.crm_deal_history 
  ALTER COLUMN deal_id DROP NOT NULL;

-- 4. Atualizar a função SECURITY DEFINER de edição de credenciais para também persistir salário e encargos
CREATE OR REPLACE FUNCTION public.admin_update_user_credentials(
  target_user_id uuid,
  new_name text DEFAULT NULL,
  new_email text DEFAULT NULL,
  new_password text DEFAULT NULL,
  new_base_salary numeric DEFAULT NULL,
  new_charges_multiplier numeric DEFAULT NULL,
  new_monthly_hours numeric DEFAULT NULL
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

  -- 1. Atualiza a tabela pública profiles incluindo salário e multiplicador
  UPDATE public.profiles
  SET 
    display_name = COALESCE(v_clean_name, display_name),
    email = COALESCE(v_clean_email, email),
    base_salary = COALESCE(new_base_salary, base_salary, 0),
    charges_multiplier = COALESCE(new_charges_multiplier, charges_multiplier, 1.0),
    monthly_hours = COALESCE(new_monthly_hours, monthly_hours, 160),
    updated_at = NOW()
  WHERE id = target_user_id;

  -- 2. Atualiza auth.users (credenciais)
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

-- 5. Permissões de execução
GRANT EXECUTE ON FUNCTION public.admin_update_user_credentials(uuid, text, text, text, numeric, numeric, numeric) TO authenticated, service_role;
