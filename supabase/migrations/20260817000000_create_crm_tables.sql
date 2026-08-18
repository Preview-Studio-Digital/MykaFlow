-- Migração para módulo de CRM e controle de papéis/permissões

-- 1. Novos papéis para usuários (Administrador Geral, Financeiro, Vendedor CRM, Gestor CRM)
DO $$
BEGIN
  -- Se o tipo app_role existir, adicionamos novos valores caso não existam
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

-- 2. Tabela de Clientes/Leads do CRM
CREATE TABLE IF NOT EXISTS public.crm_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT,
  document TEXT, -- CPF / CNPJ
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active, inactive, lead
  notes TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela de Oportunidades / Negócios / Orçamentos do CRM
CREATE TABLE IF NOT EXISTS public.crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.crm_customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  stage TEXT NOT NULL DEFAULT 'lead', -- 'lead', 'qualification', 'proposal', 'negotiation', 'won', 'lost'
  expected_close_date DATE,
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notes TEXT,
  lost_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabela de Contratos Fechados no CRM
CREATE TABLE IF NOT EXISTS public.crm_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.crm_deals(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES public.crm_customers(id) ON DELETE CASCADE,
  contract_number TEXT,
  total_value NUMERIC(14,2) NOT NULL CHECK (total_value >= 0),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  billing_type TEXT NOT NULL DEFAULT 'installments', -- 'single', 'recurring', 'installments'
  installments_count INT NOT NULL DEFAULT 1 CHECK (installments_count >= 1),
  category_id_v2 UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  subcategory_id_v2 UUID REFERENCES public.financial_subcategories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'completed', 'cancelled'
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Tabela de Parcelas / Faturas do Contrato (Integração com Fluxo de Caixa)
CREATE TABLE IF NOT EXISTS public.crm_contract_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.crm_contracts(id) ON DELETE CASCADE,
  installment_number INT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'cancelled'
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Índices para performance
CREATE INDEX IF NOT EXISTS idx_crm_deals_customer ON public.crm_deals(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON public.crm_deals(stage);
CREATE INDEX IF NOT EXISTS idx_crm_deals_assigned ON public.crm_deals(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_contracts_customer ON public.crm_contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_installments_contract ON public.crm_contract_installments(contract_id);
CREATE INDEX IF NOT EXISTS idx_crm_installments_transaction ON public.crm_contract_installments(transaction_id);

-- 7. Ativação de RLS
ALTER TABLE public.crm_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contract_installments ENABLE ROW LEVEL SECURITY;

-- 8. Políticas RLS
-- CRM Customers
CREATE POLICY "Authenticated can view crm customers" ON public.crm_customers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert crm customers" ON public.crm_customers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update crm customers" ON public.crm_customers
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete crm customers" ON public.crm_customers
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- CRM Deals
CREATE POLICY "Authenticated can view crm deals" ON public.crm_deals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert crm deals" ON public.crm_deals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update crm deals" ON public.crm_deals
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete crm deals" ON public.crm_deals
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- CRM Contracts
CREATE POLICY "Authenticated can view crm contracts" ON public.crm_contracts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert crm contracts" ON public.crm_contracts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update crm contracts" ON public.crm_contracts
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete crm contracts" ON public.crm_contracts
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- CRM Installments
CREATE POLICY "Authenticated can view crm installments" ON public.crm_contract_installments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert crm installments" ON public.crm_contract_installments
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update crm installments" ON public.crm_contract_installments
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete crm installments" ON public.crm_contract_installments
  FOR DELETE TO authenticated USING (true);
