-- Migração para tabela de Histórico / Auditoria das Requisições do CRM

CREATE TABLE IF NOT EXISTS public.crm_deal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  action_type TEXT NOT NULL DEFAULT 'update', -- 'created', 'status_changed', 'reassigned', 'comment', 'updated'
  description TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_deal_history_deal ON public.crm_deal_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_deal_history_created ON public.crm_deal_history(created_at);

ALTER TABLE public.crm_deal_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view deal history" ON public.crm_deal_history
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert deal history" ON public.crm_deal_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
