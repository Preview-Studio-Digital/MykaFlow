-- ==============================================================================
-- SCHEMA COMPLETO MYKAFLOW (FINANCEIRO + CRM INTEGRADO)
-- PROJETO: rbrqcncojnzmvebtznaf
-- EXECUTE NO SQL EDITOR: https://supabase.com/dashboard/project/rbrqcncojnzmvebtznaf/sql
-- ==============================================================================

-- 1. TIPOS ENUM & PERMISSÕES
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'financeiro', 'crm_vendedor', 'crm_gestor');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
    CREATE TYPE public.transaction_type AS ENUM ('income', 'expense');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_nature') THEN
    CREATE TYPE public.transaction_nature AS ENUM ('fixed', 'variable');
  END IF;
END $$;

-- 2. TABELA DE PERFIS DE USUÁRIOS
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABELA DE CARGOS / PERMISSÕES (RBAC)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Função auxiliar para checar papéis
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Trigger para criar perfil e cargo automaticamente no primeiro login (1º usuário = admin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count INT;
  assigned_role app_role;
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'user';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. TABELAS DE CATEGORIAS E SUBCATEGORIAS DO FINANCEIRO
CREATE TABLE IF NOT EXISTS public.financial_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type transaction_type NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financial_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.financial_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. TABELA DE TRANSAÇÕES (FLUXO DE CAIXA / DRE)
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type transaction_type NOT NULL,
  nature transaction_nature NOT NULL DEFAULT 'variable',
  category TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  category_id_v2 UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  subcategory_id_v2 UUID REFERENCES public.financial_subcategories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. TABELA DE CLIENTES DO CRM
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

-- 7. TABELA DE REQUISIÇÕES / OPORTUNIDADES DO CRM
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

-- 8. TABELA DE HISTÓRICO / AUDITORIA DAS REQUISIÇÕES
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

-- 9. TABELA DE CONTRATOS DO CRM (INTEGRAÇÃO FLUXO DE CAIXA)
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

-- 10. TABELA DE PARCELAS DO CONTRATO
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

-- 11. ÍNDICES DE ALTA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, occurred_on);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(category_id_v2);
CREATE INDEX IF NOT EXISTS idx_crm_deals_customer ON public.crm_deals(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON public.crm_deals(stage);
CREATE INDEX IF NOT EXISTS idx_crm_deals_assigned ON public.crm_deals(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_updated ON public.crm_deals(updated_at);
CREATE INDEX IF NOT EXISTS idx_crm_deal_history_deal ON public.crm_deal_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_contracts_customer ON public.crm_contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_installments_contract ON public.crm_contract_installments(contract_id);
CREATE INDEX IF NOT EXISTS idx_crm_installments_tx ON public.crm_contract_installments(transaction_id);

-- 12. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_deal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contract_installments ENABLE ROW LEVEL SECURITY;

-- 13. POLÍTICAS RLS (ACESSO INTEGRAL PARA USUÁRIOS AUTENTICADOS)
DROP POLICY IF EXISTS "Profiles Auth All" ON public.profiles;
CREATE POLICY "Profiles Auth All" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "User Roles Auth All" ON public.user_roles;
CREATE POLICY "User Roles Auth All" ON public.user_roles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Categories Auth All" ON public.financial_categories;
CREATE POLICY "Categories Auth All" ON public.financial_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Subcategories Auth All" ON public.financial_subcategories;
CREATE POLICY "Subcategories Auth All" ON public.financial_subcategories FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Transactions Auth All" ON public.transactions;
CREATE POLICY "Transactions Auth All" ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

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

-- 14. CATEGORIAS INICIAIS PADRÃO DO FINANCEIRO
INSERT INTO public.financial_categories (name, type) VALUES
  ('VENDAS DE PRODUTOS', 'income'),
  ('PRESTAÇÃO DE SERVIÇOS', 'income'),
  ('CONTRATOS / VENDAS CRM', 'income'),
  ('RECEITAS FINANCEIRAS', 'income'),
  ('OUTRAS RECEITAS', 'income'),
  ('FORNECEDORES / INSUMOS', 'expense'),
  ('FOLHA DE PAGAMENTO', 'expense'),
  ('IMPOSTOS E TRIBUTOS', 'expense'),
  ('ESTRUTURA EMPRESARIAL', 'expense'),
  ('MARKETING E VENDAS', 'expense'),
  ('ANTECIPAÇÃO DE NOTAS', 'expense'),
  ('DESPESAS DIVERSAS', 'expense')
ON CONFLICT DO NOTHING;

-- Notificar recarregamento do schema
NOTIFY pgrst, 'reload schema';
