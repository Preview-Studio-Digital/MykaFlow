-- ==============================================================================
-- MIGRAÇÃO DEFINITIVA DO CRM MYKAFLOW (EXECUTE NO SQL EDITOR DO SUPABASE)
-- URL DO SEU PROJETO: https://supabase.com/dashboard/project/jjypxgsfqbpoiwhjaovo/sql
-- ==============================================================================

-- 1. Novos papéis de permissão
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    BEGIN
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'financeiro';
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'crm_vendedor';
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'crm_gestor';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END;
  END IF;
END $$;

-- 2. Tabela de Clientes do CRM
CREATE TABLE IF NOT EXISTS public.crm_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT,
  document TEXT,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela de Requisições / Oportunidades do CRM
CREATE TABLE IF NOT EXISTS public.crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.crm_customers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  stage TEXT NOT NULL DEFAULT 'lead',
  expected_close_date DATE,
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notes TEXT,
  req_number TEXT,
  lost_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabela de Histórico / Auditoria das Requisições
CREATE TABLE IF NOT EXISTS public.crm_deal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  action_type TEXT NOT NULL DEFAULT 'update',
  description TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Tabela de Contratos Fechados no CRM
CREATE TABLE IF NOT EXISTS public.crm_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.crm_deals(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.crm_customers(id) ON DELETE SET NULL,
  contract_number TEXT,
  total_value NUMERIC(14,2) NOT NULL CHECK (total_value >= 0),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  billing_type TEXT NOT NULL DEFAULT 'installments',
  installments_count INT NOT NULL DEFAULT 1 CHECK (installments_count >= 1),
  category_id_v2 UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  subcategory_id_v2 UUID REFERENCES public.financial_subcategories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Tabela de Parcelas / Integração com Fluxo de Caixa
CREATE TABLE IF NOT EXISTS public.crm_contract_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.crm_contracts(id) ON DELETE CASCADE,
  installment_number INT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Índices de busca rápida
CREATE INDEX IF NOT EXISTS idx_crm_deals_customer ON public.crm_deals(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON public.crm_deals(stage);
CREATE INDEX IF NOT EXISTS idx_crm_deals_assigned ON public.crm_deals(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_updated ON public.crm_deals(updated_at);
CREATE INDEX IF NOT EXISTS idx_crm_deal_history_deal ON public.crm_deal_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_contracts_customer ON public.crm_contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_installments_contract ON public.crm_contract_installments(contract_id);
CREATE INDEX IF NOT EXISTS idx_crm_installments_tx ON public.crm_contract_installments(transaction_id);

-- 8. Ativar RLS
ALTER TABLE public.crm_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_deal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contract_installments ENABLE ROW LEVEL SECURITY;

-- 9. Políticas de Acesso
DROP POLICY IF EXISTS "CRM Customers Auth All" ON public.crm_customers;
CREATE POLICY "CRM Customers Auth All" ON public.crm_customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "CRM Deals Auth All" ON public.crm_deals;
CREATE POLICY "CRM Deals Auth All" ON public.crm_deals FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "CRM Deal History Auth All" ON public.crm_deal_history;
CREATE POLICY "CRM Deal History Auth All" ON public.crm_deal_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "CRM Contracts Auth All" ON public.crm_contracts;
CREATE POLICY "CRM Contracts Auth All" ON public.crm_contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "CRM Installments Auth All" ON public.crm_contract_installments;
CREATE POLICY "CRM Installments Auth All" ON public.crm_contract_installments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 10. Forçar atualização do cache de schema
NOTIFY pgrst, 'reload schema';
