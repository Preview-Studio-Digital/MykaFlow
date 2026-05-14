
-- 1. Garantir vínculo subcategoria → categoria
UPDATE public.financial_subcategories SET category_id = NULL WHERE category_id IS NOT NULL AND category_id NOT IN (SELECT id FROM public.financial_categories);
DELETE FROM public.financial_subcategories WHERE category_id IS NULL;
ALTER TABLE public.financial_subcategories ALTER COLUMN category_id SET NOT NULL;

-- FK subcategoria -> categoria (cascade no delete)
ALTER TABLE public.financial_subcategories
  DROP CONSTRAINT IF EXISTS financial_subcategories_category_id_fkey;
ALTER TABLE public.financial_subcategories
  ADD CONSTRAINT financial_subcategories_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.financial_categories(id) ON DELETE CASCADE;

-- 2. FKs em transactions (colunas v2 são as utilizadas pelo formulário)
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_category_id_v2_fkey;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_category_id_v2_fkey
  FOREIGN KEY (category_id_v2) REFERENCES public.financial_categories(id) ON DELETE SET NULL;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_subcategory_id_v2_fkey;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_subcategory_id_v2_fkey
  FOREIGN KEY (subcategory_id_v2) REFERENCES public.financial_subcategories(id) ON DELETE SET NULL;

-- 3. FK user_id -> auth.users
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 4. Índices para acelerar gráficos
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, occurred_on);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(category_id_v2);
CREATE INDEX IF NOT EXISTS idx_subcategories_category ON public.financial_subcategories(category_id);

-- 5. RLS limpa para categorias e subcategorias (substitui "Acesso Livre")
DROP POLICY IF EXISTS "Acesso Livre" ON public.financial_categories;
DROP POLICY IF EXISTS "Permitir Tudo" ON public.financial_categories;
DROP POLICY IF EXISTS "Acesso Livre" ON public.financial_subcategories;
DROP POLICY IF EXISTS "Permitir Tudo" ON public.financial_subcategories;

-- Categorias: usuário autenticado vê todas (são compartilhadas), mas só dono/admin edita
CREATE POLICY "Authenticated read categories" ON public.financial_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owner insert categories" ON public.financial_categories
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner or admin update categories" ON public.financial_categories
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owner or admin delete categories" ON public.financial_categories
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read subcategories" ON public.financial_subcategories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owner insert subcategories" ON public.financial_subcategories
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner or admin update subcategories" ON public.financial_subcategories
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owner or admin delete subcategories" ON public.financial_subcategories
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 6. Permitir INSERT em profiles pelo próprio usuário (faltava policy)
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
