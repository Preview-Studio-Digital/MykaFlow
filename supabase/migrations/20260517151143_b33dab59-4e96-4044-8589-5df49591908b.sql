
-- Fix transactions: restrict read to owner or admin
DROP POLICY IF EXISTS "Authenticated read transactions" ON public.transactions;
CREATE POLICY "Owner or admin read transactions"
ON public.transactions FOR SELECT TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- Fix profiles: restrict read to self or admin
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;
CREATE POLICY "Users view own profile or admin"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR has_role(auth.uid(), 'admin'::app_role));

-- Fix financial_categories: allow shared (user_id IS NULL) or own or admin
DROP POLICY IF EXISTS "Authenticated read categories" ON public.financial_categories;
CREATE POLICY "Read own or shared categories"
ON public.financial_categories FOR SELECT TO authenticated
USING (user_id IS NULL OR auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- Fix financial_subcategories: same
DROP POLICY IF EXISTS "Authenticated read subcategories" ON public.financial_subcategories;
CREATE POLICY "Read own or shared subcategories"
ON public.financial_subcategories FOR SELECT TO authenticated
USING (user_id IS NULL OR auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- Lock down handle_new_user (trigger-only, no need for authenticated EXECUTE)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
