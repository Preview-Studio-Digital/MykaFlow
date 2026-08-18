-- Adiciona coluna req_number para armazenar número de requisição no padrão AA/MM/01...
ALTER TABLE public.crm_deals 
ADD COLUMN IF NOT EXISTS req_number TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_deals_req_number ON public.crm_deals(req_number);
