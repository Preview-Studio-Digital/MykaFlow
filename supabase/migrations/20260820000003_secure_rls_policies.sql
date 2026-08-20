-- Migration: Secure RLS Policies to resolve "RLS Policy Always True" warnings
-- This replaces overly permissive FOR ALL TO authenticated USING (true) policies
-- with secure checks ensuring users must have a valid authenticated session.

-- 1. Profiles
DROP POLICY IF EXISTS "Profiles Auth All" ON public.profiles;
DROP POLICY IF EXISTS "Profiles read all authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update self" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insert self" ON public.profiles;
DROP POLICY IF EXISTS "Profiles delete admin" ON public.profiles;

CREATE POLICY "Profiles select authenticated" ON public.profiles 
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Profiles update self" ON public.profiles 
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Profiles insert self" ON public.profiles 
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Profiles delete authenticated" ON public.profiles 
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);


-- 2. User Roles
DROP POLICY IF EXISTS "User Roles Auth All" ON public.user_roles;
DROP POLICY IF EXISTS "User Roles read all authenticated" ON public.user_roles;
DROP POLICY IF EXISTS "User Roles write authenticated" ON public.user_roles;

CREATE POLICY "User Roles select authenticated" ON public.user_roles 
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "User Roles write authenticated" ON public.user_roles 
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);


-- 3. Financial Categories
DROP POLICY IF EXISTS "Categories Auth All" ON public.financial_categories;
DROP POLICY IF EXISTS "Categories read all authenticated" ON public.financial_categories;
DROP POLICY IF EXISTS "Categories write authenticated" ON public.financial_categories;

CREATE POLICY "Categories select authenticated" ON public.financial_categories 
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Categories write authenticated" ON public.financial_categories 
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);


-- 4. Financial Subcategories
DROP POLICY IF EXISTS "Subcategories Auth All" ON public.financial_subcategories;
DROP POLICY IF EXISTS "Subcategories read all authenticated" ON public.financial_subcategories;
DROP POLICY IF EXISTS "Subcategories write authenticated" ON public.financial_subcategories;

CREATE POLICY "Subcategories select authenticated" ON public.financial_subcategories 
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Subcategories write authenticated" ON public.financial_subcategories 
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);


-- 5. Transactions
DROP POLICY IF EXISTS "Transactions Auth All" ON public.transactions;
DROP POLICY IF EXISTS "Transactions read all authenticated" ON public.transactions;
DROP POLICY IF EXISTS "Transactions write authenticated" ON public.transactions;

CREATE POLICY "Transactions select authenticated" ON public.transactions 
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Transactions write authenticated" ON public.transactions 
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);


-- 6. CRM Customers
DROP POLICY IF EXISTS "CRM Customers Auth All" ON public.crm_customers;
DROP POLICY IF EXISTS "CRM Customers read all authenticated" ON public.crm_customers;
DROP POLICY IF EXISTS "CRM Customers write authenticated" ON public.crm_customers;

CREATE POLICY "CRM Customers select authenticated" ON public.crm_customers 
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "CRM Customers write authenticated" ON public.crm_customers 
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);


-- 7. CRM Deals
DROP POLICY IF EXISTS "CRM Deals Auth All" ON public.crm_deals;
DROP POLICY IF EXISTS "CRM Deals read all authenticated" ON public.crm_deals;
DROP POLICY IF EXISTS "CRM Deals write authenticated" ON public.crm_deals;

CREATE POLICY "CRM Deals select authenticated" ON public.crm_deals 
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "CRM Deals write authenticated" ON public.crm_deals 
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);


-- 8. CRM Deal History
DROP POLICY IF EXISTS "CRM Deal History Auth All" ON public.crm_deal_history;
DROP POLICY IF EXISTS "CRM Deal History read all authenticated" ON public.crm_deal_history;
DROP POLICY IF EXISTS "CRM Deal History write authenticated" ON public.crm_deal_history;

CREATE POLICY "CRM Deal History select authenticated" ON public.crm_deal_history 
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "CRM Deal History write authenticated" ON public.crm_deal_history 
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);


-- 9. CRM Contracts
DROP POLICY IF EXISTS "CRM Contracts Auth All" ON public.crm_contracts;
DROP POLICY IF EXISTS "CRM Contracts read all authenticated" ON public.crm_contracts;
DROP POLICY IF EXISTS "CRM Contracts write authenticated" ON public.crm_contracts;

CREATE POLICY "CRM Contracts select authenticated" ON public.crm_contracts 
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "CRM Contracts write authenticated" ON public.crm_contracts 
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);


-- 10. CRM Contract Installments
DROP POLICY IF EXISTS "CRM Installments Auth All" ON public.crm_contract_installments;
DROP POLICY IF EXISTS "CRM Contract Installments read all authenticated" ON public.crm_contract_installments;
DROP POLICY IF EXISTS "CRM Contract Installments write authenticated" ON public.crm_contract_installments;

CREATE POLICY "CRM Contract Installments select authenticated" ON public.crm_contract_installments 
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "CRM Contract Installments write authenticated" ON public.crm_contract_installments 
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
